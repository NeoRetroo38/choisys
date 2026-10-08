// Reads app.json and only adds the sub-path when exporting the web build for scenarys:
//   EXPO_BASE_URL=/choisys npx expo export -p web   → served at neowebdevsolutions.com/choisys
// Without the variable (development, Tailscale demo, native builds) nothing changes.
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL;
  if (!baseUrl) return config;
  if (!/^\/[a-z0-9-]+$/.test(baseUrl)) throw new Error('EXPO_BASE_URL must look like /choisys');
  return { ...config, experiments: { ...(config.experiments ?? {}), baseUrl } };
};
