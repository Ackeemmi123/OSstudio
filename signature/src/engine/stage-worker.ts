/** The shader stages' worker: every field and image effect on the page draws here, where the browser allows it. */
import { startStage, type StageSpec } from "./stage-core";
import { host } from "./worker-host";

host<StageSpec>((canvas, spec, post, forget) =>
  startStage(canvas, spec, {
    shown: () => post({ type: "shown" }),
    lost: () => {
      forget();
      post({ type: "lost" });
    },
  }),
);
