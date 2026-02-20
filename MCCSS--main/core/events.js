// core/events.js

const listeners = {};

export const Events = {
  on(evt, fn) {
    if (!listeners[evt]) listeners[evt] = [];
    listeners[evt].push(fn);
  },
  emit(evt, payload) {
    (listeners[evt] || []).forEach(fn => {
      try { fn(payload); } catch (e) { /* swallow */ }
    });
  }
};

export default Events;
