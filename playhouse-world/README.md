# Playhouse World

A tap-and-play dollhouse in the spirit of open-ended toy-box games: design a
character, decorate rooms, then play in them. Built to feel at home on an iPad
or an iPhone — big touch targets, no text to read, nothing to log into, and it
keeps working with the Wi-Fi off.

All of the artwork is drawn by this repo's own code (plain SVG, no image
files). It is an original app inspired by the genre, not affiliated with or
derived from any existing product.

```
playhouse-world/
  index.html              app shell
  manifest.webmanifest    installable web app metadata
  sw.js                   offline cache
  styles/app.css          design tokens + layout
  src/
    main.js               boot, routing, iOS touch handling
    store.js              saved state (localStorage) + starter content
    util.js               DOM, maths and pointer helpers
    art/
      palette.js          colour sets
      avatar.js           character part library + renderer
      furniture.js        46-piece furniture catalogue
      rooms.js            wallpapers, floors, scene coordinates
      scene.js            room composition, depth sorting, hit testing
    screens/
      home.js  avatar.js  house.js  play.js
    ui/
      components.js       buttons, trays, toasts, dialogs
      sound.js            WebAudio blips
  tools/
    serve.mjs             local static server
    smoke-test.mjs        headless phone/tablet test run
    make-icons.mjs        renders the PNG app icons from icon.svg
```

## Run it

```bash
cd playhouse-world
npm start              # or: python3 -m http.server 8080
```

Then open `http://localhost:8080`. The server prints a LAN address too — open
that on the iPad or iPhone that is on the same Wi-Fi.

Any static host works (GitHub Pages, Netlify, S3): there is no build step and
no dependency at runtime.

## Install it on an iPad or iPhone

1. Open the app in Safari.
2. Share → **Add to Home Screen**.
3. Launch it from the home screen: it runs full screen with no browser chrome,
   keeps working offline, and remembers everything you made.

## What you can do

**Character creator** — skin tone, thirteen hairstyles, eyes, mouths, blush and
freckles, tops (including dresses and a space suit), bottoms, shoes, hats and
glasses, each with its own colour palette. A dice button rolls a whole new
look. Characters are saved as a cast you can switch between.

**House builder** — six starter rooms (living room, bedroom, kitchen, bathroom,
garden, play room) plus any rooms you add. Seven wallpapers and five floors in
ten colours each. A catalogue of 46 pieces across seven categories: tap to add,
drag to move, pinch to resize, and use the handle bar to flip, paint, stack,
duplicate or remove. Every change auto-saves, and undo goes back 40 steps.

**Play mode** — your character walks where you tap, or you can pick them up and
carry them with a finger. They sit on sofas, beds, chairs, swings and bean
bags, switch the lamp, TV and stove on and off, open the fridge, and chat to
the cat, the dog and the rubber duck. Depth sorting puts them in front of or
behind furniture depending on where they are standing.

## How it works

- **No dependencies, no build.** ES modules straight from disk; the browser is
  the only toolchain.
- **Everything is SVG generated in code.** `art/avatar.js` and
  `art/furniture.js` are libraries of small drawing functions, so a part can be
  recoloured or rescaled without any asset pipeline. Pattern ids are unique per
  render, because several rooms can be on the page at once.
- **One scene coordinate system.** Rooms are always 1000 × 640 user units with
  the floor line at y = 430, so a layout looks identical on every screen —
  only the scale changes.
- **Pointer Events everywhere.** Mouse, pen and touch take the same path, and
  two-finger gestures drive the pinch-to-resize.
- **State lives in `localStorage`** under `playhouse.save.v1` and is repaired on
  load, so an old or half-written save can never break the app.

### iOS specifics

- `viewport-fit=cover` plus `env(safe-area-inset-*)` padding, so nothing hides
  under the notch, the Dynamic Island or the home indicator.
- `apple-mobile-web-app-capable` and an `apple-touch-icon` PNG for a proper
  home-screen launch.
- Page pinch-zoom, double-tap zoom and rubber-band scrolling are suppressed;
  the app's own scrolling areas still scroll.
- Tap targets are at least 44 px, which the test suite checks on every screen.
- Audio only starts after the first touch, as Safari requires.
- Layout adapts to portrait and landscape: the tray sits under the stage on a
  phone and beside it in landscape, so the room stays large.

## Tests

```bash
npm test            # headless run across four device sizes
npm run test:shots  # same, plus screenshots in .screenshots/
```

The suite drives the real app in Chromium at iPhone, iPhone-landscape, iPad and
iPad-landscape sizes and fails on any console error. It checks that the home
screen lists characters and rooms, that the creator's parts and colours apply,
that furniture can be added, dragged, painted and undone, that wallpaper
changes redraw, that in play mode the character walks to a tap, can be carried
by hand, sits down on the sofa and switches the TV on, and that everything
survives a reload. It also fails if any control is smaller than
44 px or if a screen scrolls sideways.

## Regenerating the icons

```bash
npm run icons       # icons/icon.svg → the PNGs iOS and the manifest use
```
