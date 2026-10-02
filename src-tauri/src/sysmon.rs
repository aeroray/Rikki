//! What the machine is doing, for the `sys` panel.
//!
//! `sysinfo` carries CPU, memory, system and process figures on every platform
//! the app builds for, and it is the only crate worth using for that: the
//! alternatives are either unmaintained (`heim`, last touched in 2020) or thinner
//! than it (`systemstat`). GPU is the exception, and the reason this module has
//! two platform branches of its own — see `gpu` below.
//!
//! The sampler is kept alive between calls, and that is not an optimisation. Both
//! CPU usage and GPU usage are deltas between two readings, so a fresh sampler
//! answers zero the first time and is only correct from the second call onward.

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use sysinfo::{DiskRefreshKind, Disks, Networks, ProcessesToUpdate, System};

/// How many processes the panel shows. It is a list to glance at, not a task
/// manager, and the rows it does not show are the ones nobody is looking for.
const PROCESS_LIMIT: usize = 8;

/// How many mounts the panel lists. A machine with a dozen partitions would
/// otherwise push the sections below it off the screen.
const DISK_LIMIT: usize = 4;

/// How many interfaces are listed, busiest first. The rest are the virtual
/// adapters a VPN or a hypervisor leaves behind, and they move no bytes.
const NETWORK_LIMIT: usize = 3;

/// Mounts that hold no user data and would only push the real ones down.
///
/// On macOS the sealed system volume is read-only and reports a figure nobody can
/// act on; the rest are kernel filesystems.
const SKIP_MOUNTS: &[&str] = &["/System/Volumes", "/private/var/vm", "/dev", "/proc", "/sys"];

/// How often the disk and network figures are re-read.
///
/// Their throughput is a delta between two readings divided by the interval, so
/// the interval has to be known rather than measured per call. Two seconds is the
/// compromise: one second made the numbers jitter without telling the reader
/// anything new, and the byte counters move far more slowly than a CPU.
const IO_INTERVAL: Duration = Duration::from_secs(2);

/// How often the process list is rebuilt, as opposed to how often the CPU and
/// memory are read.
///
/// Walking every process and working out its CPU share costs far more than reading
/// the CPU counters, and the list barely moves between one second and the next: it
/// is sorted by memory, which changes slowly. Three seconds is also the interval
/// `sysinfo` needs between two readings of a process for its CPU figure to mean
/// anything at all.
const PROCESS_INTERVAL: Duration = Duration::from_secs(3);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    cpu: Cpu,
    memory: Memory,
    gpus: Vec<Gpu>,
    disks: Vec<DiskRow>,
    network: Vec<NetworkRow>,
    system: SystemFacts,
    processes: Vec<ProcessRow>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Cpu {
    /// Percent, 0..100, across every core.
    usage: f32,
    /// Percent per core, in the order the system reports them.
    per_core: Vec<f32>,
    /// MHz.
    frequency: u64,
    brand: String,
    cores: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Memory {
    /// Bytes.
    total: u64,
    used: u64,
    swap_total: u64,
    swap_used: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Gpu {
    name: String,
    /// What kind of adapter this is — `Discrete` or `Integrated` — so the panel can
    /// say which is which. `GPU 0` and `GPU 1` mean nothing to anyone.
    kind: GpuKind,
    /// Percent, 0..100, or `None` when the platform cannot say.
    usage: Option<f32>,
}

#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
enum GpuKind {
    Discrete,
    Integrated,
    /// A machine that does not distinguish, which is most Macs: one SoC with one
    /// GPU in it.
    Unknown,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemFacts {
    name: String,
    os_version: String,
    kernel: String,
    hostname: String,
    /// Seconds since boot.
    uptime: u64,
}

/// One mount, as the panel lists it.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct DiskRow {
    /// The mount point, which is what identifies a volume to the reader. The
    /// device name is `\\?\Volume{…}` on Windows and `/dev/disk3s5` on macOS.
    mount: String,
    /// The volume's own label when the system gives one, otherwise empty and the
    /// panel shows the mount point alone.
    name: String,
    /// Bytes.
    total: u64,
    free: u64,
    /// Bytes per second since the previous reading.
    ///
    /// The same figure on every row, because the platform counters are per device
    /// rather than per mount: Windows reports one set for the physical disk behind
    /// `C:` and `D:`, so splitting it between them would be inventing an
    /// attribution the system does not make. The panel prints it once, under the
    /// list.
    read_per_sec: u64,
    write_per_sec: u64,
}

/// One interface's throughput.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NetworkRow {
    name: String,
    /// Bytes per second since the previous reading.
    received_per_sec: u64,
    transmitted_per_sec: u64,
    /// Bytes since the interface came up.
    total_received: u64,
    total_transmitted: u64,
}

#[derive(Serialize)]
#[derive(Clone)]
#[serde(rename_all = "camelCase")]
struct ProcessRow {
    pid: u32,
    name: String,
    /// Percent, 0..100, as `sysinfo` reports it — which is per core, so a busy
    /// eight-core process can read above 100.
    cpu: f32,
    /// Bytes.
    memory: u64,
}

/// The sampler and the last process reading, behind one lock.
///
/// They are one value rather than two because a snapshot reads both, and two locks
/// would let a process refresh land between the CPU reading and the process one.
struct Inner {
    system: System,
    processes: Vec<ProcessRow>,
    /// When `processes` was taken. The list is rebuilt on its own, slower, clock.
    processes_at: Instant,
    /// Kept between calls because both figures are deltas: a fresh `Disks` answers
    /// zero throughput the first time, and a fresh `Networks` answers zero too.
    disks: Disks,
    networks: Networks,
    disk_rows: Vec<DiskRow>,
    network_rows: Vec<NetworkRow>,
    /// When the two above were taken, which is also the interval their rates are
    /// divided by.
    io_at: Instant,
}

pub struct Monitor {
    /// Built on the first snapshot, not at startup.
    ///
    /// Constructing the sampler walks the CPU table, and doing it while the app
    /// boots makes every user pay for a panel most of them never open. It is built
    /// on the thread that first asks, which is the panel's own.
    inner: OnceLock<Mutex<Inner>>,
}

impl Monitor {
    pub fn new() -> Self {
        Self {
            inner: OnceLock::new(),
        }
    }

    fn inner(&self) -> &Mutex<Inner> {
        self.inner.get_or_init(|| Mutex::new(Inner::new()))
    }

    pub fn snapshot(&self) -> Stats {
        // A poisoned lock still holds the last good sampler, and this runs on a
        // timer: panicking here would take the panel down for the rest of the
        // session over an unrelated failure.
        let mut inner = self
            .inner()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        inner.snapshot()
    }
}

impl Inner {
    fn new() -> Self {
        // `System::new()`, not `new_all()`.
        //
        // `new_all` walks every process, every disk and the network before it
        // returns. Measured on this machine: `new_all` 429ms, `new` 0.3ms. Nothing
        // is lost — the process list is filled by the first snapshot, which
        // `processes_at` below already forces, and every figure the panel shows
        // comes from `refresh_cpu_all` and `refresh_memory` either way.
        let mut system = System::new();
        // One reading now, so the first snapshot is already a delta rather than a
        // row of zeroes.
        system.refresh_cpu_all();
        system.refresh_memory();
        // Built here rather than per snapshot: `new_with_refreshed_list` walks
        // every mount and every interface, which is the same class of cost as
        // `new_all` and must not be paid once a second.
        let disks = Disks::new_with_refreshed_list_specifics(
            DiskRefreshKind::nothing().with_storage().with_io_usage(),
        );
        let networks = Networks::new_with_refreshed_list();
        Self {
            system,
            processes: Vec::new(),
            // Backdated, so the first snapshot fills the list immediately rather
            // than showing an empty section for three seconds.
            processes_at: Instant::now() - PROCESS_INTERVAL,
            disks,
            networks,
            disk_rows: Vec::new(),
            network_rows: Vec::new(),
            // Backdated as well, so the first snapshot re-reads instead of
            // reporting a rate against a one-second baseline it never measured.
            io_at: Instant::now() - IO_INTERVAL,
        }
    }

    fn snapshot(&mut self) -> Stats {
        // Borrowed field by field rather than as a whole, so the process list can
        // be written while the sampler is being read.
        let Inner {
            system,
            processes,
            processes_at,
            disks,
            networks,
            disk_rows,
            network_rows,
            io_at,
        } = self;

        system.refresh_cpu_all();
        system.refresh_memory();

        // Disk and network, on their own slower clock. The interval is measured
        // rather than assumed, because it is what the byte deltas are divided by:
        // a tick that arrived late then reports the true rate instead of an
        // inflated one.
        if io_at.elapsed() >= IO_INTERVAL {
            let interval = io_at.elapsed();
            disks.refresh_specifics(
                true,
                DiskRefreshKind::nothing().with_storage().with_io_usage(),
            );
            networks.refresh(true);
            *disk_rows = read_disks(disks, interval);
            *network_rows = read_networks(networks, interval);
            *io_at = Instant::now();
        }

        // The expensive half, on its own clock. See `PROCESS_INTERVAL`.
        if processes_at.elapsed() >= PROCESS_INTERVAL {
            system.refresh_processes(ProcessesToUpdate::All, true);
            let mut rows: Vec<ProcessRow> = system
                .processes()
                .iter()
                .map(|(pid, process)| ProcessRow {
                    pid: pid.as_u32(),
                    name: process.name().to_string_lossy().to_string(),
                    cpu: process.cpu_usage(),
                    memory: process.memory(),
                })
                .collect();
            // By memory rather than CPU: a process's CPU figure is a delta since
            // its own last refresh, so a freshly started one reads zero for a tick
            // and the list would reshuffle on every poll. Memory is stable.
            rows.sort_by(|a, b| b.memory.cmp(&a.memory));
            rows.truncate(PROCESS_LIMIT);
            *processes = rows;
            *processes_at = Instant::now();
        }

        let processes = processes.clone();
        let system = &*system;
        let cpus = system.cpus();
        let cpu = Cpu {
            usage: system.global_cpu_usage(),
            per_core: cpus.iter().map(|core| core.cpu_usage()).collect(),
            frequency: cpus.iter().map(|core| core.frequency()).max().unwrap_or(0),
            brand: cpus.first().map(|core| core.brand().to_string()).unwrap_or_default(),
            cores: cpus.len(),
        };

        let memory = Memory {
            total: system.total_memory(),
            used: system.used_memory(),
            swap_total: system.total_swap(),
            swap_used: system.used_swap(),
        };

        Stats {
            cpu,
            memory,
            gpus: gpu::usage(),
            disks: disk_rows.clone(),
            network: network_rows.clone(),
            system: SystemFacts {
                name: System::name().unwrap_or_default(),
                os_version: System::os_version().unwrap_or_default(),
                kernel: System::kernel_version().unwrap_or_default(),
                hostname: System::host_name().unwrap_or_default(),
                uptime: System::uptime(),
            },
            processes,
        }
    }
}

/// The mounts worth listing, system drive first.
///
/// Ordered by drive letter on Windows and by size elsewhere. The letter is what a
/// person navigates by, and `C:` is the one they look for first: sorting by size
/// put `D:` on top on this machine, so the list opened with the data drive and the
/// system drive — the one that matters when it fills up — sat underneath it.
fn read_disks(disks: &Disks, interval: Duration) -> Vec<DiskRow> {
    // Summed across every disk rather than reported per mount: the platform
    // counters are per device, and a figure the panel had to split between `C:`
    // and `D:` would be inventing an attribution the system does not make.
    let read: u64 = disks.list().iter().map(|disk| disk.usage().read_bytes).sum();
    let written: u64 = disks.list().iter().map(|disk| disk.usage().written_bytes).sum();
    let (read_per_sec, write_per_sec) = per_second(read, written, interval);

    let mut rows: Vec<DiskRow> = disks
        .list()
        .iter()
        .filter(|disk| disk.total_space() > 0)
        .filter(|disk| {
            let mount = disk.mount_point().to_string_lossy();
            !SKIP_MOUNTS.iter().any(|skip| mount.starts_with(skip))
        })
        .map(|disk| DiskRow {
            mount: disk.mount_point().to_string_lossy().to_string(),
            name: disk.name().to_string_lossy().to_string(),
            total: disk.total_space(),
            free: disk.available_space(),
            read_per_sec,
            write_per_sec,
        })
        .collect();
    rows.sort_by(|a, b| match (drive_letter(&a.mount), drive_letter(&b.mount)) {
        // Both are Windows volumes: alphabetical, which puts `C:` first and keeps
        // the rest in the order the user's own Explorer shows them.
        (Some(left), Some(right)) => left.cmp(&right),
        // A Windows volume above a mount point, so the drives people think in come
        // before the ones they do not.
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        // Two mount points: the biggest first, which is the best guess available.
        (None, None) => b.total.cmp(&a.total),
    });
    rows.truncate(DISK_LIMIT);
    rows
}

/// The uppercase drive letter of a Windows mount, or `None` for anything else.
fn drive_letter(mount: &str) -> Option<char> {
    let bytes = mount.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' {
        return Some((bytes[0] as char).to_ascii_uppercase());
    }
    None
}

/// The interfaces that have moved bytes, busiest first.
///
/// Filtered on the *lifetime* totals rather than on the current rate, which is the
/// difference between a column that stays put and one that blinks: a rate of zero
/// is the normal state of an idle network, and filtering those out made the whole
/// section vanish and reappear as traffic came and went. An adapter that has never
/// carried a byte — loopback, a virtual switch nobody bound to — still drops out,
/// which is what the filter was for.
///
/// The busiest row usually has a twin: Windows reports a filter driver beside the
/// adapter it is bound to — `WLAN` and `WLAN-Huorong NDIS Filter Driver-0000` —
/// with identical counters. They are collapsed to the shorter name, because two
/// rows of the same numbers is not twice the information.
fn read_networks(networks: &Networks, interval: Duration) -> Vec<NetworkRow> {
    let mut rows: Vec<NetworkRow> = networks
        .list()
        .iter()
        .map(|(name, data)| {
            let (received_per_sec, transmitted_per_sec) =
                per_second(data.received(), data.transmitted(), interval);
            NetworkRow {
                name: name.clone(),
                received_per_sec,
                transmitted_per_sec,
                total_received: data.total_received(),
                total_transmitted: data.total_transmitted(),
            }
        })
        .filter(|row| row.total_received > 0 || row.total_transmitted > 0)
        .collect();
    rows.sort_by(|a, b| {
        // By lifetime bytes, not by the current rate. The rate changes every tick
        // and an idle interface reads zero, so ordering by it made the rows swap
        // places as traffic came and went — the list would not sit still long
        // enough to read. Lifetime totals answer the same question ("which of
        // these do I actually use") and barely move between polls.
        let left = a.total_received + a.total_transmitted;
        let right = b.total_received + b.total_transmitted;
        right
            .cmp(&left)
            // Shorter first on a tie, which is what puts `WLAN` above its own
            // filter driver rather than leaving the order to the hash map.
            .then_with(|| a.name.len().cmp(&b.name.len()))
    });
    rows.dedup_by(|a, b| {
        let same = a.received_per_sec == b.received_per_sec
            && a.transmitted_per_sec == b.transmitted_per_sec
            && a.total_received == b.total_received
            && a.total_transmitted == b.total_transmitted;
        // `a` is the later of the two, and `dedup_by` removes it when this is
        // true — so the shorter name, which sorted first, is the one that stays.
        same && a.name.starts_with(&b.name)
    });
    rows.truncate(NETWORK_LIMIT);
    rows
}

/// A byte delta as a rate, guarding the one way the division can go wrong.
///
/// A zero interval would divide by zero, and it is reachable: `elapsed` on a
/// clock with coarse resolution can read zero when two snapshots land in the same
/// tick.
fn per_second(received: u64, transmitted: u64, interval: Duration) -> (u64, u64) {
    let seconds = interval.as_secs_f64();
    if seconds <= 0.0 {
        return (0, 0);
    }
    (
        (received as f64 / seconds) as u64,
        (transmitted as f64 / seconds) as u64,
    )
}

#[cfg(test)]
mod tests {
    use super::{drive_letter, per_second, SKIP_MOUNTS};
    use std::time::Duration;

    #[test]
    fn a_rate_is_the_delta_over_the_interval() {
        assert_eq!(per_second(2_000, 1_000, Duration::from_secs(2)), (1_000, 500));
        // A sub-second interval scales up rather than rounding to zero.
        assert_eq!(per_second(500, 0, Duration::from_millis(500)), (1_000, 0));
    }

    /// A zero interval is reachable — two snapshots inside one clock tick — and
    /// dividing by it would be a panic on a timer thread.
    #[test]
    fn a_zero_interval_reports_nothing_rather_than_dividing_by_it() {
        assert_eq!(per_second(1_000, 1_000, Duration::ZERO), (0, 0));
    }

    /// The mounts the panel refuses to list, and the ones it must not.
    #[test]
    fn the_skipped_mounts_are_system_volumes_only() {
        for mount in ["/System/Volumes/Data", "/private/var/vm", "/dev", "/proc", "/sys"] {
            assert!(
                SKIP_MOUNTS.iter().any(|skip| mount.starts_with(skip)),
                "{mount} should be skipped"
            );
        }
        for mount in ["C:\\", "D:\\", "/", "/Volumes/Data", "/home"] {
            assert!(
                !SKIP_MOUNTS.iter().any(|skip| mount.starts_with(skip)),
                "{mount} should be listed"
            );
        }
    }

    /// The letter is what the sort key and the label both read, so it has to come
    /// out of every spelling Windows uses.
    #[test]
    fn a_drive_letter_is_read_from_every_spelling_of_a_mount() {
        assert_eq!(drive_letter("C:\\"), Some('C'));
        assert_eq!(drive_letter("d:/"), Some('D'));
        assert_eq!(drive_letter("E:"), Some('E'));
        assert_eq!(drive_letter("/"), None);
        assert_eq!(drive_letter("/Volumes/Data"), None);
        assert_eq!(drive_letter(""), None);
    }
}

/// GPU usage, which no crate does across platforms.
///
/// Both branches read a figure the driver already publishes, rather than talking
/// to the hardware: Windows through its performance counters, macOS through the
/// dictionary the accelerator keeps in the I/O registry. That is what makes them
/// work for every vendor — NVIDIA, AMD, Intel and Apple's own — without a driver
/// library per brand.
#[cfg(target_os = "windows")]
mod gpu {
    use std::collections::{BTreeMap, HashMap};
    use std::sync::{Mutex, OnceLock};

    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, IDXGIFactory1, DXGI_ADAPTER_FLAG_SOFTWARE,
    };
    use windows::Win32::System::Performance::{
        PdhAddEnglishCounterW, PdhCollectQueryData, PdhGetFormattedCounterArrayW, PdhOpenQueryW,
        PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_MORE_DATA,
    };

    use super::{Gpu, GpuKind};

    /// The path every vendor's driver publishes its engines under, one instance per
    /// engine: `pid_…_luid_0x…_0x…_phys_0_eng_0_engtype_3D`.
    const COUNTER: &str = "\\GPU Engine(*)\\Utilization Percentage\0";

    /// The query and its counter. PDH hands these back as bare handles rather than
    /// as a wrapper type.
    type Query = isize;

    /// The query, opened once and kept for the life of the process. Opening it per
    /// call would restart the counters, and the first reading after an open is
    /// always zero — every poll would report an idle GPU.
    fn query() -> &'static Mutex<Option<(Query, Query)>> {
        static QUERY: OnceLock<Mutex<Option<(Query, Query)>>> = OnceLock::new();
        QUERY.get_or_init(|| Mutex::new(open()))
    }

    fn open() -> Option<(Query, Query)> {
        unsafe {
            let mut query: Query = 0;
            if PdhOpenQueryW(PCWSTR::null(), 0, &mut query) != 0 {
                return None;
            }
            let path: Vec<u16> = COUNTER.encode_utf16().collect();
            let mut counter: Query = 0;
            // The English name, because the counter path is translated on a
            // localized Windows and the rest of the app has no business knowing
            // which language this machine runs in.
            if PdhAddEnglishCounterW(query, PCWSTR(path.as_ptr()), 0, &mut counter) != 0 {
                return None;
            }
            let _ = PdhCollectQueryData(query);
            Some((query, counter))
        }
    }

    /// Percent per GPU, or nothing when the counters are unavailable — a machine
    /// with no GPU counter at all, or one where the query failed to open.
    pub fn usage() -> Vec<Gpu> {
        let guard = query().lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        let Some((query, counter)) = *guard else {
            return Vec::new();
        };

        let per_gpu = unsafe { collect(query, counter) };
        let names = adapters();

        // Only the adapters DXGI knows about.
        //
        // The GPU Engine counters also exist for virtual display adapters — MuMu
        // and GameViewer both install one — and those appeared as a second row
        // called "GPU 1" that is not a GPU at all: a machine with an `F`-suffix CPU
        // and one graphics card showed two. Matching against DXGI is what tells a
        // real adapter from a driver that only reports engine counters.
        let mut found: Vec<Gpu> = per_gpu
            .iter()
            .filter_map(|(luid, percent)| {
                let (name, kind) = names.get(luid)?;
                Some(Gpu {
                    name: name.clone(),
                    kind: *kind,
                    usage: Some(*percent as f32),
                })
            })
            .collect();

        // If nothing matched at all — counters and adapters disagreeing on every
        // LUID — fall back to what the counters said rather than showing no GPU.
        if found.is_empty() {
            found = per_gpu
                .into_iter()
                .enumerate()
                .map(|(index, (_, percent))| Gpu {
                    name: format!("GPU {}", index + 1),
                    kind: GpuKind::Unknown,
                    usage: Some(percent as f32),
                })
                .collect();
        }
        found
    }

    unsafe fn collect(query: Query, counter: Query) -> BTreeMap<String, f64> {
        if PdhCollectQueryData(query) != 0 {
            return BTreeMap::new();
        }

        // Two calls: the first only says how much room the array needs.
        let mut size = 0u32;
        let mut count = 0u32;
        let status =
            PdhGetFormattedCounterArrayW(counter, PDH_FMT_DOUBLE, &mut size, &mut count, None);
        if status != PDH_MORE_DATA || size == 0 {
            return BTreeMap::new();
        }

        // The buffer has to be aligned for the items, not merely long enough.
        // `vec![0u8; size]` asks the allocator for alignment 1 and only appears to
        // work because malloc hands back a wider-aligned block; casting it to a
        // struct that needs 8 is undefined behaviour, and the cast below is what
        // the compiler is told to trust. `Vec<u64>` asks for 8 directly, which
        // covers every field PDH writes here.
        let mut buffer = vec![0u64; (size as usize).div_ceil(8)];
        let items = buffer.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
        if PdhGetFormattedCounterArrayW(
            counter,
            PDH_FMT_DOUBLE,
            &mut size,
            &mut count,
            Some(items),
        ) != 0
        {
            return BTreeMap::new();
        }

        // One instance per engine, and a GPU has several — 3D, Copy, VideoDecode.
        // The highest of them is what Task Manager shows, and it is the one that
        // answers "is the GPU busy".
        let mut busiest: BTreeMap<String, f64> = BTreeMap::new();
        for index in 0..count as usize {
            let item = &*items.add(index);
            let name = item.szName.to_string().unwrap_or_default();
            let Some(luid) = luid_of(&name) else {
                continue;
            };
            let value = item.FmtValue.Anonymous.doubleValue;
            if !value.is_finite() {
                continue;
            }
            let entry = busiest.entry(luid).or_insert(0.0);
            *entry = entry.max(value.clamp(0.0, 100.0));
        }
        busiest
    }

    /// The adapter a counter instance belongs to, out of its name.
    ///
    /// Lowercased, because that is how the counters spell it and how the adapter
    /// map is keyed — comparing the raw slice against a `{:X}` key silently matched
    /// nothing.
    fn luid_of(instance: &str) -> Option<String> {
        let start = instance.find("luid_")?;
        let rest = &instance[start..];
        let end = rest.find("_phys_")?;
        Some(rest[..end].to_ascii_lowercase())
    }

    /// Adapter descriptions and kinds, keyed by the LUID the counters report.
    ///
    /// The counter names carry a LUID and nothing a person would recognise, so the
    /// panel showed "GPU 0" and "GPU 1" with no way to tell which was which. DXGI
    /// is the only thing that maps one to a product name, and it is already part of
    /// Windows.
    ///
    /// Enumerated once and cached: the set of adapters does not change while the
    /// app runs, and this walks the hardware.
    fn adapters() -> &'static HashMap<String, (String, GpuKind)> {
        static ADAPTERS: OnceLock<HashMap<String, (String, GpuKind)>> = OnceLock::new();
        ADAPTERS.get_or_init(|| unsafe {
            let mut map = HashMap::new();
            // Generic and argument-free: the type parameter is what it returns.
            let Ok(factory) = CreateDXGIFactory1::<IDXGIFactory1>() else {
                return map;
            };

            let mut index = 0u32;
            while let Ok(adapter) = factory.EnumAdapters1(index) {
                index += 1;
                let Ok(desc) = adapter.GetDesc1() else {
                    continue;
                };
                // A fixed-size wide buffer, not necessarily terminated.
                let end = desc
                    .Description
                    .iter()
                    .position(|unit| *unit == 0)
                    .unwrap_or(desc.Description.len());
                let name = String::from_utf16_lossy(&desc.Description[..end]);
                if name.is_empty() {
                    continue;
                }
                // The counter spells the LUID as two little-endian halves, in
                // lowercase: `luid_0x00000000_0x0000d09f`. `AdapterLuid` is the
                // same 64 bits, and the case has to match — `{:08X}` here produced
                // keys that never matched a counter and left every card unnamed.
                let luid = desc.AdapterLuid;
                let high = (luid.HighPart as u32) as u64;
                let low = luid.LowPart as u64;
                let key = format!("luid_0x{high:08x}_0x{low:08x}");

                // Software adapters — the WARP rasterizer, the Basic Render Driver
                // — report no dedicated memory and are not a GPU anyone chose.
                if desc.Flags & DXGI_ADAPTER_FLAG_SOFTWARE.0 as u32 != 0 {
                    continue;
                }
                // A dedicated-memory figure is what separates the two in practice:
                // integrated adapters share system memory and report little or
                // none of their own, discrete ones report their VRAM.
                let kind = if desc.DedicatedVideoMemory > 0 {
                    GpuKind::Discrete
                } else {
                    GpuKind::Integrated
                };
                map.insert(key, (name, kind));
            }
            map
        })
    }
}

#[cfg(target_os = "macos")]
mod gpu {
    use std::ffi::{c_char, c_void, CString};

    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::number::CFNumber;
    use core_foundation::string::{CFString, CFStringRef};

    use super::{Gpu, GpuKind};

    type IoObject = u32;
    type KernReturn = i32;
    type MachPort = u32;

    const IO_OBJECT_NULL: IoObject = 0;

    // Declared here rather than pulled in with a crate: it is six calls, and the
    // bindings crates for them are either unmaintained or larger than the app.
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOServiceMatching(name: *const c_char) -> CFDictionaryRef;
        fn IOServiceGetMatchingServices(
            port: MachPort,
            matching: CFDictionaryRef,
            existing: *mut IoObject,
        ) -> KernReturn;
        fn IOIteratorNext(iterator: IoObject) -> IoObject;
        fn IORegistryEntryCreateCFProperty(
            entry: IoObject,
            key: CFStringRef,
            allocator: *const c_void,
            options: u32,
        ) -> *const c_void;
        fn IOObjectRelease(object: IoObject) -> KernReturn;
    }

    /// Percent per accelerator, or nothing when the registry has none.
    ///
    /// Every accelerator — Apple's AGX, Intel, AMD, NVIDIA — keeps a
    /// `PerformanceStatistics` dictionary in the I/O registry, and the driver
    /// writes its own utilisation into it. Reading that needs no privileges and no
    /// vendor library, which is why it is what the menu-bar monitors do.
    pub fn usage() -> Vec<Gpu> {
        let mut found = Vec::new();
        unsafe {
            let Ok(class) = CString::new("IOAccelerator") else {
                return found;
            };
            // A fresh dictionary each call; `IOServiceGetMatchingServices` consumes
            // the reference, so it must not be wrapped and dropped here.
            let matching = IOServiceMatching(class.as_ptr());
            if matching.is_null() {
                return found;
            }

            // `kIOMainPortDefault` is `MACH_PORT_NULL`.
            let mut iterator = IO_OBJECT_NULL;
            if IOServiceGetMatchingServices(0, matching, &mut iterator) != 0 {
                return found;
            }

            loop {
                let entry = IOIteratorNext(iterator);
                if entry == IO_OBJECT_NULL {
                    break;
                }
                if let Some(percent) = utilization(entry) {
                    // Named by position here, and that is honest: the registry
                    // entry carries an accelerator, not a product name, and a Mac
                    // has one SoC with one GPU in it, so there is nothing to tell
                    // apart. `Unknown` keeps the panel from claiming otherwise.
                    found.push(Gpu {
                        name: format!("GPU {}", found.len() + 1),
                        kind: GpuKind::Unknown,
                        usage: Some(percent),
                    });
                }
                let _ = IOObjectRelease(entry);
            }
            let _ = IOObjectRelease(iterator);
        }
        found
    }

    /// The utilisation the driver recorded for one accelerator.
    unsafe fn utilization(entry: IoObject) -> Option<f32> {
        let key = CFString::from_static_string("PerformanceStatistics");
        let stats_ref =
            IORegistryEntryCreateCFProperty(entry, key.as_concrete_TypeRef(), std::ptr::null(), 0);
        if stats_ref.is_null() {
            return None;
        }
        // Create rule: this call hands back a +1 reference for us to own.
        let stats =
            CFDictionary::<CFString, CFType>::wrap_under_create_rule(stats_ref as CFDictionaryRef);

        // `Device Utilization %` is the general one; `GPU Activity(%)` is what the
        // older NVIDIA and Intel drivers used, and some still do.
        for name in ["Device Utilization %", "GPU Activity(%)"] {
            let key = CFString::from_static_string(name);
            let Some(value) = stats.find(&key) else {
                continue;
            };
            if let Some(number) = value.downcast::<CFNumber>() {
                if let Some(percent) = number.to_f64() {
                    return Some(percent.clamp(0.0, 100.0) as f32);
                }
            }
        }
        None
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
mod gpu {
    use super::Gpu;

    /// Neither platform this app ships for, so there is nothing to read. The panel
    /// simply shows no GPU section.
    pub fn usage() -> Vec<Gpu> {
        Vec::new()
    }
}