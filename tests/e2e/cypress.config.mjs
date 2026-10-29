import { plugin } from '../../dist/plugin.js';

export default {
  video: false,
  screenshotOnRunFailure: false,
  e2e: {
    specPattern: 'specs/*.cy.js',
    supportFile: 'support.js',
    setupNodeEvents(on, config) {
      return plugin(on, config);
    },
  },
};
