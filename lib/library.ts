import type { Kind, Weapon } from "./game/world";

// The Enemy Library's pages, from devpost/enemy-design.md ("The Enemy
// Library"). The Fleet runs like a mid-size company, with Fleet Command as
// management; each enemy's joke comes from what it does in the game, so the
// lore teaches the behavior. Keep this and the design doc saying the same thing.

export type LibraryPage = {
  kind: Kind;
  name: string;
  species: string;
  lore: string;
  attack: string;
  weapon: { id: Weapon; name: string; text: string };
  spot: string;
  firstSeen: string;
};

export const LIBRARY: LibraryPage[] = [
  {
    kind: 2,
    name: "Ploomba",
    species: "Drone · row 3",
    lore: `Ploomba's job description is one word long, and the word is "down." It picks the column you're standing in and falls straight down it. No turning, no gun. Its last performance review said "shows no growth." Ploomba had it framed.`,
    attack:
      "It locks onto the column you're in when it starts revving, then slides over and falls straight down that column without turning or firing. One column to either side is safe. From wave 4, Ploombas dive in mirrored pairs, and one that misses comes back down the same column once more before it goes home.",
    weapon: {
      id: "wingmen",
      name: "Wingmen",
      text: "When a carrier Ploomba dives, two mini-drones fall in the columns on either side of it, so you need to be two columns clear. Grab it and two mini-drones ride beside your ship and fire straight up with you, and each one soaks up the first bullet or diver that touches it.",
    },
    spot: "Its spikes spin for 0.8 seconds while a thin silver line marks the column it will fall down. A carrier's line is three columns wide.",
    firstSeen: "Wave 1. Carriers with Wingmen from wave 2.",
  },
  {
    kind: 1,
    name: "Waffle",
    species: "Bat · row 2",
    lore: "Waffle schedules its indecision. Every swerve of its zigzag is booked before it leaves the formation, right up to row 9, where Fleet Command makes it pick a spot, and it always picks yours. Its bullets are the only straight thing about it.",
    attack:
      "It zigzags down out of the formation, switching direction every half second, and fires one straight bullet down at row 5 and another at row 8. At row 9 it checks where you are, once, and flies straight at that spot. Keep moving as it reaches row 9 and it commits to a place you've already left.",
    weapon: {
      id: "fan",
      name: "Fan",
      text: "A carrier Waffle turns every bullet it fires into three, one straight down and two drifting outward, both in formation and on the dive. Grab it and each of your shots splits the same way, the side shots about three columns out by the time they reach the formation, and the three still count as one shot on screen.",
    },
    spot: "A dotted red line shows its whole zigzag the moment it launches, and a short red arrow snaps out at row 9 to the spot it has picked.",
    firstSeen: "Wave 1, carrying the first Fan of the game. From wave 3, two Waffles fly beside every Winkless that dives.",
  },
  {
    kind: 0,
    name: "Winkless",
    species: "Cyclops · row 1",
    lore: "Winkless got into management because it never blinks in meetings. It does one lap of the room and then parks above you to stare. Its eye lights up before every shot, which the rest of the Fleet considers oversharing. Hit it once and it finally blinks, and it takes a second shot to end the meeting. When the meeting's over it leaves through the floor.",
    attack:
      "When it launches it picks the column you're in, and after one small loop it parks halfway down that column. It fires twice, each time at where you are at the moment it fires, and the shot flies straight without turning. Then it drops straight down that column on its way out, so leave the column before it does. It takes two hits. After the first its eye stays shut, but it keeps shooting.",
    weapon: {
      id: "beam",
      name: "Eye Beam",
      text: "A carrier Winkless skips the aimed shots. A thin orange warning line runs down its column for 0.8 seconds, then a beam fills that column for half a second. Grab it and your shot becomes an instant beam up your whole column that hits everything in it at once (a Winkless only loses one of its two hits), but your reload doubles from 0.35 to 0.7 seconds.",
    },
    spot: "The orange path line drawn at launch shows which column it will park over, which gives you about 3 seconds before a beam. Its eye glows for 0.8 seconds before every shot.",
    firstSeen:
      "In the formation from wave 1, diving from wave 2. Carriers with the Eye Beam from wave 3, when it also starts diving with two Waffles beside it. Shoot it while they're still there and it's worth double.",
  },
];
