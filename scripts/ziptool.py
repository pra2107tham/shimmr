#!/usr/bin/env python3
"""Create or unpack a zip without needing zip(1) and unzip(1).

    ziptool.py create  <archive.zip> <directory>   # directory is the archive root
    ziptool.py extract <archive.zip> <into>

Git Bash on Windows has neither zip nor unzip, and packaging has to work there:
Windows is a supported target, and a maintainer on Windows must be able to run
`make package` and get the same archive as the release runner does. python3 is
already required by packaging, so this replaces a dependency rather than adding
one.

Executable bits are carried both ways. They mean nothing on Windows, but the
archive should say the same thing wherever it is opened.
"""
import os
import pathlib
import stat
import sys
import zipfile

if len(sys.argv) != 4:
    sys.exit(__doc__)

mode, archive, target = sys.argv[1], pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])

if mode == "create":
    root = target.resolve()
    # Entries are sorted so two runs over the same tree produce the same
    # archive; a release artifact that differs run to run is one nobody can
    # reproduce.
    paths = sorted(p for p in root.rglob("*") if p.is_file())
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for p in paths:
            info = zipfile.ZipInfo(str(p.relative_to(root.parent).as_posix()))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.date_time = (1980, 1, 1, 0, 0, 0)
            info.external_attr = (stat.S_IMODE(p.stat().st_mode) | stat.S_IFREG) << 16
            z.writestr(info, p.read_bytes())

elif mode == "extract":
    with zipfile.ZipFile(archive) as z:
        for info in z.infolist():
            # A member path that escapes the destination is how a zip is used
            # as a write primitive. Refuse rather than sanitise.
            dest = (target / info.filename).resolve()
            if not str(dest).startswith(str(target.resolve())):
                sys.exit(f"refusing to extract outside {target}: {info.filename}")
            written = z.extract(info, target)
            perm = info.external_attr >> 16
            if perm and not info.is_dir():
                os.chmod(written, stat.S_IMODE(perm))

else:
    sys.exit(__doc__)
