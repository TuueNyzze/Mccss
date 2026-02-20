// core/router.js

export const Router = {
  routes: {},
  current: null,

  register(name, renderFn) {
    this.routes[name] = renderFn;
  },

  go(name) {
    if (!this.routes[name]) {
      // eslint-disable-next-line no-console
      console.error("Route not found:", name);
      return;
    }
    this.current = name;
    this.routes[name]();
  }
};
