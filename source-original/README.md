# source-original — immutable baseline artefacts

Files placed here are **never modified**. `tools/unpack.sh` reads from this
directory and writes everything it produces to `source-working/`.

## Expected contents

| File | Status |
|---|---|
| `ESGDigitalRadiologicalSurveys_1_1_0_5_FINAL_UNMANAGED.zip` | **NOT SUPPLIED** — current baseline, expected SHA-256 `1485ec3c20d9def9b2039c58c72c06d2f6277ccdd38a00aedae725fd9299e92a` |
| `ESGDigitalRadiologicalSurveys_1_0_0_8_FULL_INSTRUMENT_REGISTER(1).zip` | **NOT SUPPLIED** — earlier baseline, also never received |

Neither baseline package has ever reached this repository. The 1.1.0.5 ZIP
named in the 1.1.0.6 brief is on a Windows desktop, which a Linux container
cannot read. See `docs/BASELINE_REPORT_1_1_0_6.md`.

## Adding the baseline

```bash
# copy the ZIP in, then:
tools/bootstrap.sh
tools/unpack.sh source-original/ESGDigitalRadiologicalSurveys_1_1_0_5_FINAL_UNMANAGED.zip
tests/run_all.sh
```

Large binaries should go in via Git LFS if they are to be tracked at all;
otherwise keep the artefact out of Git and supply it to the build directly.
