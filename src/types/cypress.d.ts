/// <reference types="cypress" />

declare namespace Cypress {
  interface TestConfigOverrides {
    /**
     * Tags for filtering tests with cypress-marks
     * Tags must start with @ prefix (e.g., '@smoke', '@regression')
     */
    tags?: string[];
  }

  interface SuiteConfigOverrides {
    /**
     * Tags for filtering tests with cypress-marks
     * Tags must start with @ prefix (e.g., '@smoke', '@regression')
     */
    tags?: string[];
  }
}
