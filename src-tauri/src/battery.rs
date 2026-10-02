//! Battery state, which `sysinfo` does not cover.
//!
//! The crate carries CPU, memory, disk, network, processes and components on
//! every platform this app builds for, and nothing for power. There is no small
//! crate that fills the gap either: `battery` pulls in a stack of platform
//! dependencies for one number, and `starship-battery` is the same code under a
//! different name. Both platforms answer the question with a handful of calls,
//! so this is that instead — the same reasoning as `gpu` above, which is the
//! other thing no crate does across platforms.
//!
//! A desktop answers `None`, and that is the ordinary case rather than a
//! failure: the panel drops the section when there is no battery in the machine.

/// One reading of the battery.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Battery {
    /// Percent, 0..100.
    pub percent: f32,
    pub charging: bool,
    /// True when the machine is plugged in, which is not the same as charging:
    /// a full battery on mains is plugged in and not charging.
    pub plugged: bool,
    /// Seconds until empty, or `None` when the platform will not say — a machine
    /// on mains reports nothing useful, and some batteries report nothing at all.
    pub seconds_left: Option<u64>,
}

#[cfg(target_os = "windows")]
pub fn read() -> Option<Battery> {
    windows::read()
}

#[cfg(target_os = "macos")]
pub fn read() -> Option<Battery> {
    macos::read()
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
pub fn read() -> Option<Battery> {
    None
}

/// Windows: `GetSystemPowerStatus`, one call, no COM and no privileges.
#[cfg(target_os = "windows")]
mod windows {
    use super::Battery;
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};

    /// `SYSTEM_POWER_STATUS::BatteryLifePercent` when the reading means nothing.
    const UNKNOWN_PERCENT: u8 = 255;
    /// `BatteryLifeTime` when the battery is not discharging, or is unknown.
    const UNKNOWN_SECONDS: u32 = u32::MAX;
    /// `ACLineStatus` when the machine has no battery at all.
    const AC_OFFLINE: u8 = 0;
    const AC_ONLINE: u8 = 1;

    pub fn read() -> Option<Battery> {
        let mut status = SYSTEM_POWER_STATUS::default();
        // Safety: the call fills a struct this function owns for the duration,
        // and it is documented to fail rather than write on a bad pointer.
        if unsafe { GetSystemPowerStatus(&mut status) }.is_err() {
            return None;
        }

        // A desktop reports AC online with a battery percentage of 255. Reading
        // that as a real number would put "—%" in a panel on every tower PC.
        if status.BatteryFlag == 128 || status.BatteryLifePercent == UNKNOWN_PERCENT {
            return None;
        }

        let seconds_left = if status.BatteryLifeTime == UNKNOWN_SECONDS {
            None
        } else {
            Some(status.BatteryLifeTime as u64)
        };

        Some(Battery {
            percent: status.BatteryLifePercent as f32,
            charging: status.BatteryFlag & 0b1000 != 0,
            plugged: status.ACLineStatus == AC_ONLINE,
            // Guarded as well as the flag: a machine on mains reports both an
            // online line and no time left, and "0 分钟" would be a lie.
            seconds_left: if status.ACLineStatus == AC_OFFLINE {
                seconds_left
            } else {
                None
            },
        })
    }
}

/// macOS: `pmset -g batt`, the same source the menu bar's own icon uses.
///
/// Parsed rather than linked against IOKit's power-source API, which would be
/// several dozen lines of CFDictionary walking for four numbers — and `pmset` is
/// a stable interface that every macOS version has answered the same way.
#[cfg(target_os = "macos")]
mod macos {
    use super::Battery;
    use std::process::Command;

    pub fn read() -> Option<Battery> {
        let output = Command::new("pmset").args(["-g", "batt"]).output().ok()?;
        if !output.status.success() {
            return None;
        }
        parse(&String::from_utf8_lossy(&output.stdout))
    }

    /// Pulls the four numbers out of the two lines `pmset` prints.
    ///
    /// The first line names the source — `AC Power` or `Battery Power` — and the
    /// second carries `98%; charging; 1:23 remaining` or `98%; charged; …`.
    /// Split out from `read` so the parsing is tested without a Mac.
    pub fn parse(text: &str) -> Option<Battery> {
        let mut plugged = false;
        let mut percent = None;
        let mut charging = false;
        let mut seconds_left = None;

        for line in text.lines() {
            let line = line.trim();
            if let Some(rest) = line.strip_prefix("Now drawing from") {
                plugged = rest.trim_start().starts_with("'AC Power'");
                continue;
            }
            let Some((number, rest)) = line.split_once('%') else {
                continue;
            };
            // `-InternalBattery-0 (id=…) 98%` — the percentage is the last token
            // before the sign, so the number is what follows the final space.
            let Ok(value) = number.rsplit(' ').next().unwrap_or("").trim().parse::<f32>() else {
                continue;
            };
            percent = Some(value);
            charging = rest.contains("charging") || rest.contains("charged");
            seconds_left = parse_remaining(rest);
        }

        Some(Battery {
            percent: percent?,
            charging,
            plugged,
            seconds_left,
        })
    }

    /// `1:23 remaining` or `0:12:34 remaining` into seconds.
    fn parse_remaining(rest: &str) -> Option<u64> {
        let index = rest.find("remaining")?;
        let clock = rest[..index].trim().split_whitespace().next_back()?;
        let mut parts = clock.split(':').rev();
        let seconds = parts.next()?.parse::<u64>().ok()?;
        let minutes = parts.next().unwrap_or("0").parse::<u64>().ok()?;
        let hours = parts.next().unwrap_or("0").parse::<u64>().ok()?;
        Some(hours * 3600 + minutes * 60 + seconds)
    }
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "macos")]
    use super::macos::parse;

    #[cfg(target_os = "macos")]
    #[test]
    fn a_discharging_battery_reports_its_remaining_time() {
        let battery = parse(
            "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234567)\t82%; discharging; 2:14 remaining present: true\n",
        )
        .expect("parsed");
        assert_eq!(battery.percent, 82.0);
        assert!(!battery.plugged);
        assert!(!battery.charging);
        assert_eq!(battery.seconds_left, Some(2 * 3600 + 14 * 60));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn a_full_battery_on_mains_has_no_time_left_to_report() {
        let battery = parse(
            "Now drawing from 'AC Power'\n -InternalBattery-0 (id=1234567)\t100%; charged; 0:00 remaining present: true\n",
        )
        .expect("parsed");
        assert_eq!(battery.percent, 100.0);
        assert!(battery.plugged);
        assert!(battery.charging);
    }

    /// A desktop prints one line and no percentage, and the section is dropped.
    #[cfg(target_os = "macos")]
    #[test]
    fn a_machine_without_a_battery_is_none() {
        assert!(parse("Now drawing from 'AC Power'\n").is_none());
    }
}
