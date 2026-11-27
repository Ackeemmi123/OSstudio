/**
 * Which way the visitor is reading: "down" once the page has moved 12 px
 * down in a row, "up" after 4 px up, and nothing in between. Distance is
 * counted in one direction at a time, so a trackpad's jitter back and forth
 * never flickers what follows it. Lenis moves the window's own scroll
 * position, so this follows smooth scrolling as well.
 *
 * Shared by the menu button and the call-to-action pill, which both step out
 * of the way while reading down and come back at the first move up.
 */
export type Heading = "down" | "up" | undefined;

export function onHeading(listener: (heading: Heading) => void): void {
  let lastY = scrollY;
  let travel = 0;
  addEventListener(
    "scroll",
    () => {
      const step = scrollY - lastY;
      lastY = scrollY;
      travel = step * travel > 0 ? travel + step : step;
      listener(travel > 12 ? "down" : travel < -4 ? "up" : undefined);
    },
    { passive: true },
  );
}
