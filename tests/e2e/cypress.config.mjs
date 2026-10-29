import { plugin } from '../../dist/plugin.js';

export default {
  video: false,
  screenshotOnRunFailure: false,
  e2e: {
    specPattern: 'specs/*.cy.js',
    supportFile: 'support.js',
    async setupNodeEvents(on, config) {
      // Exercise browser-only path filtering without changing Cypress's specs.
      const specPattern = config.specPattern;
      const rawPaths = config.env._marksTestRawPaths;
      if (rawPaths) delete config.specPattern;
      const result = await plugin(on, config);
      if (rawPaths) result.specPattern = specPattern;
      return result;
    },
  },
};
