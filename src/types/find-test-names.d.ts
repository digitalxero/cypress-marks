declare module 'find-test-names' {
  interface TestInfo {
    name: string;
    type: 'test' | 'suite';
    tags?: string[];
  }

  interface TestNamesResult {
    tests: TestInfo[];
    suites: TestInfo[];
  }

  export function getTestNames(source: string): TestNamesResult;
}
