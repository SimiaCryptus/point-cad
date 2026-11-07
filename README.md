# Point CAD

*Describe a shape by its relationships. Let the computer find the coordinates.*

Point CAD is a small, browser-based design tool. You do not draw a shape directly. You
describe it: these two points are 5 units apart, this angle is a right angle, this point
lies halfway between those two. Point CAD then finds positions for every point that satisfy
your description as closely as possible.

If you have used a spreadsheet, the idea will feel familiar. You write the rules, and the
numbers follow. Change a rule, and everything that depends on it updates.

---

## A little background

The idea of drawing with constraints is almost as old as computer graphics. In 1963 Ivan
Sutherland built **Sketchpad**, one of the first interactive drawing programs. It already let
users say "make these lines parallel" or "keep this length fixed" and have the machine work
out the rest. The idea later moved into engineering software. Today's mechanical CAD packages
are built around "parametric sketches", where dimensions and relationships drive the
geometry, rather than the other way round.

Those tools are powerful. They are also large, specialised and focused on manufacturing.
Point CAD keeps only the core of the idea:

- a set of **points**,
- a set of **measurements** you care about, and
- a **solver** that moves the points until the measurements come out right.

Because the core is so small, it is easy to see what is happening. It is also easy to apply
the same machinery to things that are not mechanical parts at all, such as colour palettes
(see [Beyond geometry](#beyond-geometry-colour-themes) below).

---

## The theory, in plain terms

### Points, variables and measures

A **point** is a location in space. In the default geometric space, a point is a position in
3D. A **variable** is a named number you can reuse, such as `width` or `wall`. A variable can
be fixed, or you can leave it free and let the solver choose its value.

A **measure** is anything you can compute from points: a distance, an angle, a midpoint, an
area, or whether a set of points lie on a line. Some measures produce a single number. Others
produce several numbers at once. For example, one statement can lock a group of points into a
rigid arrangement.

### Constraints are targets

A **constraint** pairs a measure with a target:

- *equal to*: "the distance from A to B is 10"
- *at least*: "the gap between these two must be ≥ 2"
- *at most*: "this angle must be ≤ 90°"

For each constraint, Point CAD calculates how far the current design is from the target. This
error is called the *residual*. An equality constraint is unhappy whenever its measure is off
in either direction. An inequality constraint is completely happy anywhere on the allowed side
and only complains when you cross the line. This makes it easy to express design limits
("no smaller than…") alongside exact requirements.

### Solving is careful compromise

The solver adjusts all the free points and variables together to make the total error as
small as possible. This approach is called *least squares*. When your description is
consistent, the error falls to zero and every constraint is met exactly. When it is not, for
example if you ask for a triangle with sides 1, 1 and 10, you still get the closest possible
design, and Point CAD shows you which constraints are pulling against each other.

The solver starts from **seeds**: the positions the points have before solving. Many
descriptions have more than one valid answer. A triangle can be "flipped", for instance. The
seeds decide which answer you end up with. Dragging a point to a new place before you solve is
a natural way to choose between those answers.

### Degrees of freedom: what's still loose?

Every free coordinate is a *degree of freedom*. Every constraint uses up some of them. After a
solve, Point CAD reports what remains:

- **Fully constrained**: the description pins the shape down completely.
- **Under-constrained (slack)**: some part of the design can still move without breaking any
  rule. This is often a sign that you forgot a dimension.
- **Over-constrained / conflicting**: there are more rules than freedoms, and they disagree.

### Ignoring "where" and "which way round"

There is one subtle point. A square of side 10 is the same square wherever it sits and however
it is turned. A naïve solver would report "the whole shape can still slide and spin" as slack,
even though nothing is actually wrong.

By default, Point CAD takes care of this for you. When you have not anchored the design (no
points fixed, or only one), the solver:

1. moves the finished shape so it is centred on the origin, and
2. turns it to line up with its natural axes, keeping its longest direction along a main axis.

These "move and spin" freedoms are reported as **gauge-fixed**, which means "settled by
convention". They are not counted as missing constraints. If you fix exactly one point, that
point becomes the pivot. The **Center** button applies the same tidy-up to your seeds before
you solve. If you would rather keep the raw solver output, you can turn this behaviour off.

---

## The interface

Point CAD is a single 3D viewport with a set of floating tool windows on top of it.

### The viewport

The viewport shows your points and the relationships between them. You can look around in
several ways:

- **Orbit** by dragging. The view turns like a turntable and does not flip upside down.
- **Zoom** with the mouse wheel. The zoom moves towards whatever is under the cursor.
  Ctrl-drag moves the camera in and out smoothly.
- **Pan and pinch** on touch screens.
- **Keyboard**: the arrow keys orbit, `+` and `−` zoom, `F` frames the model, and `R` resets
  the view. Number keys jump to standard views (front, side, top, and so on), like in many
  3D programs.
- **Axis gizmo**: click an axis in the small corner indicator to look straight along it.
- **Double-click** a point to focus on it, or double-click empty space to fit everything in
  view.

### The tool windows

Each part of the workflow has its own window. A button on the toolbar shows or hides each
window. You can drag and resize the windows anywhere over the viewport, so you can keep open
only what you need.

| Window          | What it's for |
|-----------------|---------------|
| **Variables**   | Named numbers. Fix them, or leave them free for the solver to choose. |
| **Points**      | Every point, its seed position, and whether it is fixed or free. |
| **Constraints** | The rules: each measure, its target, and how well it is met right now. |
| **Script**      | The whole design as short, readable text. Edit it directly if you prefer typing. |
| **Solve**       | Run the solver. See the remaining error, the degrees-of-freedom report, and any conflicts. |

The Script window and the other windows show the same design in two forms. Some people like to
build a model by clicking, and others by writing lines such as "distance A B = 10". Point CAD
supports both, and you can switch between them at any time.

---

## Beyond geometry: colour themes

Nothing in the theory above requires a "point" to be a position in physical space. A point
only needs to be somewhere you can measure things. **A colour is a point too.** Its
coordinates are lightness, chroma and hue, and the "distance" between two colours can be their
contrast or how different they look.

Point CAD includes a **theme designer** built on exactly this idea. Instead of choosing colours
one by one, you describe the relationships a good palette needs:

- "body text must have at least this much contrast against the background"
- "these three accent colours should be evenly spaced in hue"
- "the hover state is slightly lighter than the normal state"

The solver then finds colours that satisfy all of these rules together.

The theme designer also supports **scenarios**. A typical example is a light theme and a dark
theme that share some values (a brand hue, for instance) but differ in others. You describe
both scenarios, mark which values they share, and solve them together, so the two themes stay
consistent with each other. You can then switch between scenarios to inspect each one.

This is the main reason the project is interesting. One small, understandable engine, "points
plus measured relationships plus a solver", turns out to fit problems that look completely
different from each other.

---

## Why it's interesting

- **Intent, not coordinates.** You record *why* a design looks the way it does. Edit one
  dimension and the rest of the design adjusts to match, instead of breaking.
- **Honest feedback.** The tool does not just fail silently. It tells you what is still loose,
  what is fixed by convention, and which of your rules disagree.
- **Inequalities as first-class rules.** Real design is full of limits, such as "at least
  this much contrast" or "no closer than that". Point CAD treats these limits as rules just as
  important as exact values.
- **Small enough to understand.** There is no hidden feature tree and no huge menu system. You
  can learn the whole model in an afternoon.
- **Not just shapes.** The same approach works for colour, and could in principle work for any
  space where you can measure things.

---

## Who might find it useful

- **Designers** who want layouts, diagrams or palettes that follow clear rules, and who want
  those rules to keep working when something changes.
- **Accessibility-minded teams** who need colour themes that meet contrast targets in both
  light and dark modes, without endless manual adjustment.
- **Teachers and students** in geometry, design or engineering. Point CAD shows ideas like
  degrees of freedom, over-constraint and "best-fit" solutions in a direct, visual way.
- **Makers and hobbyists** who want to sketch a mechanism or a piece of furniture from its
  dimensions before committing to a full CAD package.
- **Anyone curious** about how parametric CAD works underneath, and what else the same idea
  can do.

---

## Where it's heading

Ideas under consideration include:

- remembering your window layout between visits,
- smoother, inertia-based orbiting,
- a "stay close to my seeds" alignment option, which sits between the automatic tidy-up and
  none at all,
- for colour work: shared values between measures, repeated patterns, importing existing design
  tokens, wide-gamut (Display-P3) colour, and checks for colour-vision deficiency.