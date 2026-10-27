export const visualCatalog = Object.freeze({
  home: Object.freeze({ title: 'A world of little wonders', caption: 'Where shall we go together?', sky: '#e7efe4', ground: '#b4d2a5', items: ['sun', 'tree', 'flower'], cues: ['float'] }),
  space: Object.freeze({ title: 'Hello, outer space!', caption: 'Big dreams. Little explorers.', sky: '#253c65', ground: '#607395', items: ['star', 'rocket', 'planet'], cues: ['float'] }),
  ocean: Object.freeze({ title: 'Under the sea', caption: 'A whole blue world to discover.', sky: '#c5eaf0', ground: '#70bec8', items: ['fish', 'fish', 'shell'], cues: ['float'] }),
  garden: Object.freeze({ title: 'In the wonderful garden', caption: 'Watch little things grow.', sky: '#e1edcd', ground: '#a5c68a', items: ['flower', 'tree', 'flower'], cues: ['float'] }),
  animals: Object.freeze({ title: 'Meet our animal friends', caption: 'What sound can you make?', sky: '#f1e4bd', ground: '#c1ce91', items: ['tree', 'cat', 'tree'], cues: ['float'] }),
  dinosaurs: Object.freeze({ title: 'A dinosaur adventure', caption: 'Stomp into a prehistoric world.', sky: '#d7e6d1', ground: '#95b797', items: ['tree', 'dinosaur', 'tree'], cues: ['stomp', 'float'] }),
  vehicles: Object.freeze({ title: 'Ready, set, roll!', caption: 'Let’s take a gentle trip together.', sky: '#e3edf3', ground: '#a9bd9c', items: ['traffic-light', 'car', 'road'], cues: ['drive', 'float'] }),
  numbers: Object.freeze({ title: 'Count the little wonders', caption: 'One, two, three… what do you see?', sky: '#f6e4cb', ground: '#e2bc88', items: ['one', 'two', 'three'], cues: ['count', 'float'] }),
  weather: Object.freeze({ title: 'A little weather watch', caption: 'What might the clouds be doing?', sky: '#dceaf2', ground: '#b3c998', items: ['sun', 'cloud', 'rain'], cues: ['float'] }),
  stories: Object.freeze({ title: 'A story is beginning', caption: 'Let’s imagine what happens next.', sky: '#eee3f1', ground: '#c7b2c8', items: ['book', 'castle', 'star'], cues: ['float'] }),
  music: Object.freeze({ title: 'Make a little music', caption: 'Clap, tap, and find your rhythm.', sky: '#ece0ed', ground: '#c3acd0', items: ['note', 'note', 'star'], cues: ['float'] })
});

const patterns = [
  ['space', /\b(space|rocket|moon|planet|astronaut|stars?|outer space)\b/giu],
  ['ocean', /\b(ocean|sea|fish|whale|shark|dolphin|underwater|submarine)\b/giu],
  ['dinosaurs', /\b(dinosaurs?|t[\s-]?rex|prehistoric|stomp(?:ing)?)\b/giu],
  ['vehicles', /\b(cars?|trucks?|buses|bus|vehicles?|race(?:car| cars?)|traffic|road|driving|motorcycles?|bicycles?|bikes?)\b/giu],
  ['animals', /\b(animals?|cats?|dogs?|lions?|elephants?|zoo|pupp(?:y|ies)|kittens?|bears?|birds?)\b/giu],
  ['garden', /\b(garden|flowers?|trees?|butterfl(?:y|ies)|plants?|seeds?|leaves)\b/giu],
  ['music', /\b(music|sing(?:ing)?|songs?|dance|rhythm|clap(?:ping)?)\b/giu],
  ['numbers', /\b(count(?:ing)?|numbers?|how many|one,?\s+two|one,?\s+two,?\s+three|[0-9]+)\b/giu],
  ['weather', /\b(weather|rain(?:ing)?|rainbow|clouds?|sunny|wind(?:y)?|snow(?:ing)?|thunder|lightning)\b/giu],
  ['stories', /\b(stories|story|fairy tale|once upon a time|castle|dragon|knight|princess)\b/giu]
];

function latestTopic(text) {
  if (typeof text !== 'string') return null;
  if (/\b(count(?:ing)?|numbers?|how many)\b/iu.test(text)) return 'numbers';
  let selected = null, latest = -1;
  for (const [theme, regex] of patterns) {
    for (const match of text.matchAll(regex)) {
      if (match.index > latest) { selected = theme; latest = match.index; }
    }
  }
  return selected;
}

export function sceneForText(text, fallback = 'home') {
  const topic = latestTopic(text);
  return topic || (Object.hasOwn(visualCatalog, fallback) ? fallback : 'home');
}

export function validateVisualHint(hint) {
  if (!hint || typeof hint !== 'object' || Array.isArray(hint)) return null;
  const { theme, cue } = hint;
  if (typeof theme !== 'string' || !Object.hasOwn(visualCatalog, theme)) return null;
  const allowedCues = visualCatalog[theme].cues;
  if (cue !== undefined && (typeof cue !== 'string' || !allowedCues.includes(cue))) return null;
  return { theme, cue: cue || allowedCues[0] };
}

export class SceneController {
  constructor(element) {
    this.element = element;
    this.show('home');
  }

  show(name, cue) {
    if (!Object.hasOwn(visualCatalog, name) || name === this.name && (!cue || cue === this.cue)) return;
    this.name = name;
    const theme = visualCatalog[name];
    this.cue = cue && theme.cues.includes(cue) ? cue : theme.cues[0];
    this.element.dataset.scene = name;
    this.element.dataset.cue = this.cue;
    this.element.style.setProperty('--scene-sky', theme.sky);
    this.element.style.setProperty('--scene-ground', theme.ground);
    const title = document.getElementById('scene-title');
    const caption = document.getElementById('scene-caption');
    title.textContent = theme.title;
    caption.textContent = theme.caption;
    this.element.querySelectorAll('.scene-object use').forEach((use, index) => {
      use.setAttribute('href', `#art-${theme.items[index]}`);
    });
  }

  follow(text, visualHint) {
    const hint = validateVisualHint(visualHint);
    if (hint) {
      this.show(hint.theme, hint.cue);
      return this.name;
    }
    const topic = latestTopic(text);
    if (topic) this.show(topic);
    return this.name;
  }
}
