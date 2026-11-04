import test from 'node:test';
import assert from 'node:assert/strict';
import {filterRelevantPlaces} from '../server/place-relevance.js';
const names = arr => arr.map(place_name => ({place_name}));
test('regular steak excludes obvious hamburger-steak restaurants', () => {
  assert.deepEqual(filterRelevantPlaces('스테이크', names(['스테이크하우스','맛있는 함박스테이크','햄버그 전문점','그릴 레스토랑'])).map(p=>p.place_name), ['스테이크하우스','그릴 레스토랑']);
});
test('hamburger steak search does not exclude hamburger steak', () => {
  assert.equal(filterRelevantPlaces('함박스테이크',names(['함박스테이크 전문점'])).length,1);
});
test('unrelated menus are unchanged', () => {
  assert.equal(filterRelevantPlaces('피자',names(['함박스테이크','피자집'])).length,2);
});
test('ramen excludes explicit instant-ramen shops', () => {
  assert.deepEqual(filterRelevantPlaces('돈코츠 라멘',names(['일본 라멘집','즉석라면 전문점'])).map(p=>p.place_name), ['일본 라멘집']);
});
