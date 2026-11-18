// The story of Sunreach Bay, as data: who is who and every line they say. Remy Sol comes home
// broke to find Aunt Odile's laundromat squeezed by Vic Halloran's Marina Crew, and works the
// city's streets, harbor and beach to take Saltmarsh back. Missions read their dialogue here.

export const CAST = {
  remy: { name: 'Remy', full: 'Remy Sol', about: 'Came home to Sunreach Bay with nothing but a bus ticket stub.' },
  odile: { name: 'Odile', full: 'Odile Baptiste', about: "Runs Odile's Suds in Saltmarsh. Knows every secret that ever went through a spin cycle." },
  teo: { name: 'Teo', full: 'Teo Banks', about: 'Getaway driver turned plaza hot-dog vendor, still faster than anybody on Sol Boulevard.' },
  vic: { name: 'Vic', full: 'Vic Halloran', about: 'Owns the marina, the beach bars and, he thinks, the whole south side.' },
  crew: { name: 'Crew', full: 'Halloran Marina Crew', about: 'Red caps, short tempers.' },
};

export const STORY = {
  homecoming: {
    title: 'Homecoming',
    intro: [
      ['odile', 'Remy Sol. Six years and not one postcard. Look at you, all bones and sunburn.'],
      ['remy', "Missed you too, Auntie. Heard the shop's in trouble."],
      ['odile', 'Halloran wants Saltmarsh. First thing, get yourself some wheels. Borrow one. Nobody walks in this town.'],
    ],
    outro: [
      ['odile', 'Hm. It runs. Keep the Vela 9 in the glovebox. It was your uncle\'s. Try not to need it.'],
    ],
  },
  spin: {
    title: 'Spin Cycle',
    intro: [
      ['odile', "Halloran's men took my week's takings to a warehouse at the Old Harbor. It's in a black bag."],
      ['odile', 'Grab it and run it to Teo at Sol Plaza. And Remy? Do not bring the police to Teo.'],
    ],
    mid: [['crew', 'Hey! Somebody\'s at the bag! Call it in!']],
    outro: [
      ['teo', 'Remy Sol, as I live and breathe. Clean drop, no sirens. You still drive like a stolen rumour.'],
      ['teo', "I'll get this back to Odile. Go see her. She's got a list."],
    ],
  },
  beach: {
    title: 'Beach Rules',
    intro: [
      ['odile', 'The Marina Crew shakes down every umbrella stand on Coral Strand. Red caps, can\'t miss them.'],
      ['odile', 'Go and tell them the beach is closed. Loudly.'],
    ],
    outro: [
      ['odile', 'Vendors are already sending me fruit baskets. One of them sent this Gull SMG too. Don\'t ask, just take it.'],
    ],
  },
  wheels: {
    title: 'Hot Wheels',
    intro: [
      ['odile', 'Halloran keeps his pride and joy outside his girlfriend\'s villa in Palmetto Heights. A Vesper GT, gold paint.'],
      ['odile', 'Take it to the chop yard on Eastreach Highway. Scratch it and the buyer walks.'],
    ],
    outro: [
      ['teo', 'Clean as a church. Halloran is going to lose his mind. That is the idea, right?'],
    ],
  },
  tide: {
    title: 'Low Tide',
    intro: [
      ['odile', 'Halloran is running. He keeps a ledger: every cop, every councillor he owns. He\'s taking it to his boat.'],
      ['odile', 'Get to the docks before he does. Stop that car, Remy. Bring me the ledger.'],
    ],
    mid: [['vic', 'You! Odile\'s stray! You have no idea whose town this is!']],
    outro: [
      ['odile', 'Every name, every payment. By Monday half the south side will be looking for a new job.'],
      ['remy', 'And Saltmarsh?'],
      ['odile', 'Saltmarsh is ours. Sunreach Bay is yours, nephew. Try not to burn it down.'],
    ],
  },
  courier: {
    title: 'Courier Run',
    intro: [['odile', 'Package for a regular. Quick and quiet, the usual.']],
    outro: [['odile', 'Good. There\'s always more laundry.']],
  },
};

export const ORDER = ['homecoming', 'spin', 'beach', 'wheels', 'tide'];
