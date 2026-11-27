/** The 3D band's worker: the band draws here, where the browser allows it. */
import { host } from "../engine/worker-host";
import { startBand, type BandSpec } from "./band-core";

host<BandSpec>((canvas, spec, post, forget) =>
  startBand(canvas, spec, {
    shown: () => post({ type: "shown" }),
    lost: () => {
      forget();
      post({ type: "lost" });
    },
    report: (report) => post({ type: "report", ...report }),
  }),
);
