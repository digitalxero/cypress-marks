export {
  createTagMatcher,
  createTagSet,
  validateTag,
  validateTags,
  TagValidationError,
} from './tag-matcher.js';

export {
  createNameMatcher,
  createCombinedMatcher,
  processPattern,
} from './name-matcher.js';

export {
  parsePathSpec,
  parsePathSpecs,
  matchesFile,
  matchesTest,
  createPathFilter,
  shouldIncludeByPath,
} from './path-matcher.js';

export type { PathSpec, PathFilter } from './path-matcher.js';
