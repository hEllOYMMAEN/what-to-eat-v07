// Conservative, name-based relevance rules. A Kakao keyword match is not proof
// that a restaurant actually sells the recommended dish.
const RULES = [
  {
    menu: name => /스테이크/.test(name) && !/함박|함바그|햄버그|햄버그스테이크|함바크/.test(name),
    // Exclude only restaurants whose names clearly indicate hamburger steak.
    irrelevant: /함박|함바그|함바크|햄버그|햄버그스테이크|hamburg|hambak/i,
  },
  {
    menu: name => /라멘/.test(name) && !/라면/.test(name),
    irrelevant: /라면전문|라면집|즉석라면|분식라면/,
  },
];

export function filterRelevantPlaces(menuName, places) {
  const rules = RULES.filter(rule => rule.menu(menuName));
  if (!rules.length) return places;
  return places.filter(place => !rules.some(rule => rule.irrelevant.test(place.place_name || place.name || '')));
}
