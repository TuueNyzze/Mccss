// core/network.js

export const Network = {
  online: (typeof navigator !== 'undefined') ? navigator.onLine : true,

  init() {
    if (typeof window !== 'undefined') {
      window.addEventListener("online", () => {
        this.online = true;
      });

      window.addEventListener("offline", () => {
        this.online = false;
      });
    }
  },

  isOnline() {
    return this.online;
  },

  async ping(url) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }
};

Network.init();
