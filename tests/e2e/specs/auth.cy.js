/* global describe, it, expect */
describe('Auth', { tags: ['@protect'] }, () => {
  it('login', () => {
    expect(true).to.equal(true);
  });

  it('logout', { tags: ['@sso'] }, () => {
    expect(true).to.equal(true);
  });

  it('slow login', { tags: ['@slow'] }, () => {
    expect(true).to.equal(true);
  });
});
