export default {
  async fetch(request, env) {
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('DrTech.Care Kiosk System', { status: 200 });
  },
};
