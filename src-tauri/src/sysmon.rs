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

use std::sync::Mutex;

use serde::Serialize;
use sysinfo::{ProcessesToUpdate, System};

/// How many processes the panel shows. It is a list to glance at, not a task
/// manager, and the rows it does not show are the ones nobody is looking for.
const PROCESS_LIMIT: usize = 8;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    cpu: Cpu,
    memory: Memory,
    gpus: Vec<Gpu>,
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
    /// Percent, 0..100, or `None` when the platform cannot say.
    usage: Option<f32>,
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

#[derive(Serialize)]
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

pub struct Monitor {
    system: Mutex<System>,
}

impl Monitor {
    pub fn new() -> Self {
        let mut system = System::new_all();
        // One reading now, so the first snapshot the panel asks for is already a
        // delta rather than a row of zeroes.
        system.refresh_cpu_all();
        Self {
            system: Mutex::new(system),
        }
    }

    pub fn snapshot(&self) -> Stats {
        // A poisoned lock still holds the last good sampler, and this runs on a
        // timer: panicking here would take the panel down for the rest of the
        // session over an unrelated failure.
        let mut system = self
            .system
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        system.refresh_cpu_all();
        system.refresh_memory();
        system.refresh_processes(ProcessesToUpdate::All, true);

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

        let mut processes: Vec<ProcessRow> = system
            .processes()
            .iter()
            .map(|(pid, process)| ProcessRow {
                pid: pid.as_u32(),
                name: process.name().to_string_lossy().to_string(),
                cpu: process.cpu_usage(),
                memory: process.memory(),
            })
            .collect();
        // By memory rather than CPU: CPU usage of a process is a delta since its
        // own last refresh, so a freshly started process reads zero for a tick and
        // the list would reshuffle on every poll. Memory is stable between polls.
        processes.sort_by(|a, b| b.memory.cmp(&a.memory));
        processes.truncate(PROCESS_LIMIT);

        Stats {
            cpu,
            memory,
            gpus: gpu::usage(),
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

/// GPU usage, which no crate does across platforms.
///
/// Both branches read a figure the driver already publishes, rather than talking
/// to the hardware: Windows through its performance counters, macOS through the
/// dictionary the accelerator keeps in the I/O registry. That is what makes them
/// work for every vendor — NVIDIA, AMD, Intel and Apple's own — without a driver
/// library per brand.
#[cfg(target_os = "windows")]
mod gpu {
    use std::collections::BTreeMap;
    use std::sync::{Mutex, OnceLock};

    use windows::core::PCWSTR;
    use windows::Win32::System::Performance::{
        PdhAddEnglishCounterW, PdhCollectQueryData, PdhGetFormattedCounterArrayW, PdhOpenQueryW,
        PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_MORE_DATA,
    };

    use super::Gpu;

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
        // Named by position: the counter reports a LUID, not a product name, and
        // mapping one to the other means DXGI enumeration for a label.
        per_gpu
            .into_iter()
            .enumerate()
            .map(|(index, (_, percent))| Gpu {
                name: format!("GPU {index}"),
                usage: Some(percent as f32),
            })
            .collect()
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

        let mut buffer = vec![0u8; size as usize];
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
            let entry = busiest.entry(luid.to_string()).or_insert(0.0);
            *entry = entry.max(value.clamp(0.0, 100.0));
        }
        busiest
    }

    /// The adapter a counter instance belongs to, out of its name.
    fn luid_of(instance: &str) -> Option<&str> {
        let start = instance.find("luid_")?;
        let rest = &instance[start..];
        let end = rest.find("_phys_")?;
        Some(&rest[..end])
    }
}

#[cfg(target_os = "macos")]
mod gpu {
    use std::ffi::{c_char, c_void, CString};

    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::number::CFNumber;
    use core_foundation::string::{CFString, CFStringRef};

    use super::Gpu;

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
                    found.push(Gpu {
                        name: format!("GPU {}", found.len()),
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
