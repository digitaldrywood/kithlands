import config from "./playwright.config.js";

// CI has no hardware GPU. Use the same software WebGL renderer as local
// visual verification instead of the host's fallback graphics driver.
export default {
  ...config,
  use: {
    ...config.use,
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader"],
    },
  },
};
