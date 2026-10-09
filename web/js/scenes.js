const themes = {
  home: { title: 'A world of little wonders', caption: 'Where shall we go together?', sky: '#e7efe4', ground: '#b4d2a5', items: ['sun', 'tree', 'flower'] },
  space: { title: 'Hello, outer space!', caption: 'Big dreams. Little explorers.', sky: '#253c65', ground: '#607395', items: ['star', 'rocket', 'planet'] },
  ocean: { title: 'Under the sea', caption: 'A whole blue world to discover.', sky: '#c5eaf0', ground: '#70bec8', items: ['fish', 'fish', 'shell'] },
  garden: { title: 'In the wonderful garden', caption: 'Watch little things grow.', sky: '#e1edcd', ground: '#a5c68a', items: ['flower', 'tree', 'flower'] },
  animals: { title: 'Meet our animal friends', caption: 'What sound can you make?', sky: '#f1e4bd', ground: '#c1ce91', items: ['tree', 'cat', 'tree'] },
  dinosaurs: { title: 'A dinosaur adventure', caption: 'Stomp into a prehistoric world.', sky: '#d7e6d1', ground: '#95b797', items: ['tree', 'dinosaur', 'tree'] },
  music: { title: 'Make a little music', caption: 'Clap, tap, and find your rhythm.', sky: '#ece0ed', ground: '#c3acd0', items: ['note', 'note', 'star'] },
  numbers: { title: 'Count the little wonders', caption: 'One, two, three… what do you see?', sky: '#f6e4cb', ground: '#e2bc88', items: ['one', 'two', 'three'] }
};
const patterns = [
  ['space', /\b(space|rocket|moon|planet|astronaut|stars?|sun)\b/i],
  ['ocean', /\b(ocean|sea|fish|whale|shark|dolphin|underwater)\b/i],
  ['dinosaurs', /\b(dinosaurs?|t-rex|prehistoric|stomp)\b/i],
  ['animals', /\b(animals?|cats?|dogs?|lions?|elephants?|zoo|puppy|kitten)\b/i],
  ['garden', /\b(garden|flowers?|trees?|butterfly|plants?|seeds?)\b/i],
  ['music', /\b(music|sing|song|dance|rhythm|clap)\b/i],
  ['numbers', /\b(count|numbers?|one|two|three)\b/i]
];
export function sceneForText(text, fallback = 'home') {
  // Most recent topic wins, rather than an old word earlier in a long reply.
  let selected = fallback, latest = -1;
  for (const [scene, regex] of patterns) {
    for (const match of text.matchAll(new RegExp(regex.source, 'gi'))) {
      if (match.index > latest) { selected = scene; latest = match.index; }
    }
  }
  return selected;
}
export class SceneController {
  constructor(element) { this.element = element; this.show('home'); }
  show(name) {
    if (!themes[name] || name === this.name) return;
    this.name = name;
    const theme = themes[name];
    this.element.dataset.scene = name;
    this.element.style.setProperty('--scene-sky', theme.sky);
    this.element.style.setProperty('--scene-ground', theme.ground);
    document.getElementById('scene-title').textContent = theme.title;
    document.getElementById('scene-caption').textContent = theme.caption;
    this.element.querySelectorAll('.scene-object use').forEach((use, i) => use.setAttribute('href', `#art-${theme.items[i]}`));
  }
  follow(text) { this.show(sceneForText(text, this.name)); }
}
