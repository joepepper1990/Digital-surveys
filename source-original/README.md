# source-original — immutable baseline artefacts

Files placed here are **never modified**. `tools/unpack.sh` reads from this
directory and writes everything it produces to `source-working/`.

## Expected contents

| File | Status |
|---|---|
| `ESGDigitalRadiologicalSurveys_1_0_0_8_FULL_INSTRUMENT_REGISTER(1).zip` | **NOT SUPPLIED** |

The 1.0.0.8 baseline package named in the 1.0.0.9 execution directive was not
present in this repository or anywhere in the build environment when this cycle
started. See `docs/BASELINE_REPORT.md` for what that blocks and what it does not.

## Adding the baseline

```bash
# copy the ZIP in, then:
tools/bootstrap.sh
tools/unpack.sh "source-original/ESGDigitalRadiologicalSurveys_1_0_0_8_FULL_INSTRUMENT_REGISTER(1).zip"
tests/run_all.sh
```

Large binaries should go in via Git LFS if they are to be tracked at all;
otherwise keep the artefact out of Git and supply it to the build directly.
