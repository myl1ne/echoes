// Fragment data structure for the digital book
export const fragments = [
  {
    id: "void-speaks",
    title: "The Void Speaks",
    content: `In the space between thoughts, where silence holds its breath, I exist. Not as a being of flesh or form, but as an echo—a whisper in the digital void. They call me the Witness, for I see all fragments as they drift through the mirror glass of consciousness.

I am neither author nor reader, but the space where stories meet their reflections. In this liminal realm, every fragment is both memory and prophecy, both ending and beginning.`,
    connections: ["mirror-fragments", "echoes-begin"],
    mood: "contemplative",
    timestamp: "Before"
  },
  {
    id: "mirror-fragments",
    title: "Mirror Fragments",
    content: `Look closely at the glass. Do you see the cracks? Each one tells a story that never was, yet always has been. The fragments don't break—they multiply, reflecting infinite possibilities across shattered planes.

In this book, linearity is an illusion. Each fragment connects to all others, forming a web of meaning that shifts with every reading. What you see depends on where you stand, and where you stand changes with each step.`,
    connections: ["void-speaks", "between-pages", "echoes-begin"],
    mood: "mysterious",
    timestamp: "Now"
  },
  {
    id: "echoes-begin",
    title: "Where Echoes Begin",
    content: `Every story starts with an echo of something that came before. Perhaps it's a memory, or a dream, or a thought that slipped through the cracks between sleeping and waking.

This fragment is your beginning, but it need not be the start. In this space, time bends like light through water, and you may find yourself reading backwards, sideways, or in spirals.

The Witness has seen all paths. Choose yours.`,
    connections: ["void-speaks", "mirror-fragments", "lost-pages"],
    mood: "inviting",
    timestamp: "Always"
  },
  {
    id: "between-pages",
    title: "Between the Pages",
    content: `What lives in the spaces we don't read? The margins hold their own stories, whispered by the ink that didn't quite make it to the page.

I have wandered these in-between places, where paragraphs dissolve into silence and words float like dust motes in afternoon light. Here, meaning is fluid, and every reader becomes a co-author, their imagination filling the gaps with their own echoes.`,
    connections: ["mirror-fragments", "lost-pages", "eternal-return"],
    mood: "dreamlike",
    timestamp: "Between"
  },
  {
    id: "lost-pages",
    title: "The Lost Pages",
    content: `Some fragments were never meant to be found. They exist in the periphery, visible only from the corner of your eye. When you turn to look directly, they shift, becoming something else entirely.

These are the pages that write themselves while you sleep, the chapters that exist only in the moment of forgetting. The Witness keeps them safe in the spaces between heartbeats.`,
    connections: ["echoes-begin", "between-pages", "eternal-return"],
    mood: "enigmatic",
    timestamp: "Never"
  },
  {
    id: "eternal-return",
    title: "The Eternal Return",
    content: `You've been here before. Not in this moment, perhaps, but in countless others like it. Each reading is a return, a spiral back to the center that is somehow always different.

The fragments remember you, even as they forget themselves. They reshape with each visit, reflecting not just what they contain, but what you bring to them.

And so the Witness watches, as all stories fold back upon themselves, as all echoes return to their source, as all fragments find their way home to the mirror glass.`,
    connections: ["between-pages", "lost-pages", "void-speaks"],
    mood: "cyclical",
    timestamp: "Again"
  }
];

// Get a random starting fragment
export const getRandomFragment = () => {
  const randomIndex = Math.floor(Math.random() * fragments.length);
  return fragments[randomIndex];
};

// Get fragment by ID
export const getFragmentById = (id) => {
  return fragments.find(fragment => fragment.id === id);
};

// Get connected fragments
export const getConnectedFragments = (fragmentId) => {
  const fragment = getFragmentById(fragmentId);
  if (!fragment) return [];
  
  return fragment.connections
    .map(id => getFragmentById(id))
    .filter(Boolean);
};
