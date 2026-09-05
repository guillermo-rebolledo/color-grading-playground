# DaVinci Intermediate and Apple Log

Choose transfer and primaries separately in project Input, Working, Output,
and CST from/to. Tag DaVinci Wide Gamut assets with **DaVinci Intermediate /
DaVinci Wide Gamut**; the app supports this gamut directly. Apple Log captures
use **Apple Log / Rec.2020**. Selecting a transfer preserves the existing gamut
selection, so set both fields to match the source. No preparation conversion or
silent Rec.709 retagging is needed for DWG.

Use Linear working transfer for exposure and other linear-light adjustments.
Log working encodings are available for deliberate CST workflows; existing
node warnings identify incompatible declarations. Numeric output stays in the
chosen output pair, while the viewer converts separately to sRGB / Rec.709.
There is no look LUT, tone mapping, or gamut compression.

## References and constants

- Blackmagic Design, [DaVinci Wide Gamut Intermediate, v1.1](https://documents.blackmagicdesign.com/InformationNotes/DaVinci_Resolve_17_Wide_Gamut_Intermediate.pdf),
  August 2021, pp. 3–4. Use the corrected green x=0.1682 from this revision.
- Apple, [Apple Log Profile White Paper](https://download.developer.apple.com/Developer_Tools/Apple_Log_profile/Apple_Log_Profile_White_Paper.pdf),
  September 2023, part 028-00768, pp. 4–6. The publisher download redirects to
  sign-in; the [published paper's mirror](https://fr.scribd.com/document/695704838/Apple-Log-Profile-White-Paper)
  was used to inspect the table and equations. This implements original Apple
  Log. Apple's [capture API definition](https://developer.apple.com/documentation/avfoundation/avcapturecolorspace/applelog)
  also identifies its BT.2020 primaries.

With scene-linear `L` and encoded `E`, Intermediate uses:

- `A=0.0075`, `B=7`, `C=0.07329248`, `M=10.44426855`.
- Encode `L*M` at `L <= 0.00262409`, otherwise `(log2(L+A)+B)*C`.
- Decode `E/M` at `E <= 0.02740668`, otherwise `2^(E/C-B)-A`.

Retain both rounded thresholds, including their tiny mismatch. The linear toe
continues below zero. Grey 0.18 encodes to 0.336043272385.
DWG D65 white is (0.3127, 0.3290), RGB xy are (0.8000, 0.3130),
(0.1682, 0.9877), (0.0790, −0.1155). The existing offline generator produces
RGB/XYZ matrices from these coordinates; primary tests reference the publisher's
printed matrix independently.

Apple Log uses `R0=-0.05641088`, `Rt=0.01`, `c=47.28711236`,
`beta=0.00964052`, `gamma=0.08550479`, `delta=0.69336945`:

- Encode zero below R0; `c*(L-R0)^2` below Rt;
  otherwise `gamma*log2(L+beta)+delta`.
- Decode R0 below zero; `sqrt(E/c)+R0` below `Pt=c*(Rt-R0)^2`;
  otherwise `2^((E-delta)/gamma)-beta`.

Pt is approximately 0.208555315955. Black, grey, and 90% white encode to
0.150476452301, 0.488272458527, and 0.681686795934. The quadratic toe and floor
are retained: scene values below R0 are irrecoverable after encoding. A negative
code decodes to R0. This floor is an operation-domain rule, even in unbounded mode.

## Range and verification contract

Input is normalized full-range straight RGB: 10-bit codes divide by 1023.
Video/legal-range sources must be explicitly expanded before import. Range is
never inferred from the log name. Positive log branches continue above code one;
there is no added highlight clamp. Output's clamp policy remains explicit.
Both transforms live in the shared GPU grading evaluator.

Schema version 1 stores `davinci-intermediate` and `apple-log` transfer enums,
and `davinci-wide-gamut` primaries. JSON graph round trips and undo/redo retain
these in project and CST encodings. Both encodings export through
[LUT export](lut-export.md); disk persistence is a separate implementation slice.

Tests use independent literal Float32 reference vectors, including breakpoint
neighbors, black/grey, negative and above-one values. Encode/gamut tolerance is
5e-6 absolute; decoded linear values use 5e-6 times max(1, absolute reference)
to account for float log inversion through scene value 200. Inverses below Apple's
floor must recover the floor. UI tests use synthetic PNG neutral patches and
verify display conversion plus independent selectors and history. These fixtures
do not depend on the future photographed sample collection.
