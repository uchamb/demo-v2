# VR Vake landscape — research and model notes

Researched 15 September 2026. This is an interactive architectural interpretation of a proposed development in its mapped neighborhood.

## Project sources

- [VR Vake official website](https://vrvake.ge/): project identity, 49 Chavchavadze Avenue address, former Sports University site, planned 260 m height / 70 floors, public amenities and architectural references.
- [VR Holding project page](https://vr.ge/en/project/sky-tower): completion listed as 2031 and additional project / neighborhood context.
- The official website's `data-map_markers` and `data-map_settings` identify the project at **41.7122948 N, 44.7467461 E**. This is the scene origin. It is a marketing map pin, not a cadastral coordinate or building footprint.

The project combines homes with business, retail, hospitality, fitness, wellness and recreational uses. Published features include coworking, restaurants, underground parking and an infinity pool. Vake Park and Mikheil Meskhi Stadium are neighboring destinations. Turtle Lake, Central Park and the Philharmonic belong to the wider context; they are outside this model's local extent. No sales availability, investment return, apartment pricing or promised walking times are represented.

## Original 2D architectural renders

Local copies are in `/landscape/references/` so the scene works without third-party requests. Image rights remain with their owners / VR Holding; inclusion is for this project reference study.

| Local image | Original source |
| --- | --- |
| exterior-day.jpg | https://vrvake.ge/wp-content/uploads/2026/04/ExtCam_05_V4-1-768x1024.jpg |
| exterior-evening.jpg | https://vrvake.ge/wp-content/uploads/2026/04/ExtCam_08_V5-1-scaled.jpg |
| exterior-detail.jpg | https://vrvake.ge/wp-content/uploads/2025/11/vrvaketower1.jpg |
| public-realm.jpg | https://vrvake.ge/wp-content/uploads/2026/06/vr_Ext_21-1024x571.jpg |

Visible cues carried into the procedural model: slender rounded glass volumes, vertical façade fins, three planted recesses between four volumes, a glazed base and landscaped entrance. The renders do not supply complete architectural plans. Floor plates, dimensions other than published height, podium, gardens, rooftop pool and unseen details are illustrative. The model is not suitable for construction or cadastral use.

## Geographic data

`src/data/neighborhood.json` is a compact, locally bundled OpenStreetMap snapshot. Data © OpenStreetMap contributors, licensed under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright). The modified snapshot is distributed under ODbL. Keep attribution when reusing it.

Retrieved from:

- https://api.openstreetmap.org/api/0.6/map?bbox=44.7405,41.7080,44.7530,41.7166
- https://api.openstreetmap.org/api/0.6/relation/17233994/full — Vake Park
- https://api.openstreetmap.org/api/0.6/relation/14100477/full — woodland
- https://api.openstreetmap.org/api/0.6/relation/18799262/full — woodland

Way 25753200 supplies Mikheil Meskhi Stadium's footprint. Way 92193048 supplies Neptune Sport Complex. Open multipolygon members for park and woodland are joined into closed rings; interior holes are retained.

The renderer preserves mapped street centerlines and surrounding building outlines. It clips them to a **1,000 × 940 m** context tile. Coordinates use X east, Z south and Y up; metres are estimated from latitude/longitude with a local equirectangular projection. Heights prefer OSM `height`, then `building:levels × 3.2 m`; missing heights receive explicitly estimated massing. This map snapshot may include old structures or omit recent changes.

## Floor exploration reference

`/landscape/references/floor-reference.png` is the image supplied by the user for this demo. The rounded perimeter, mint apartment zones, partitions and central circulation core inform the new procedural cutaway. The 12 apartments, internal room details and section floor ranges (1–16, 17–32, 33–48, 49–70) are illustrative. Every selected floor uses the same concept layout; no floor-specific plans or apartment availability have been provided.

The neighborhood spans the context tile described above. No study-area outline is displayed.

## Approximations

- Terrain is a continuous stylized slope with small variations, **not sampled elevation / DEM data**. Hills rise toward the southern and western context edges; precise elevations are not asserted.
- OSM roads provide centerlines, not curb geometry. Widths, lane markings, cars and lamps are illustrative.
- Tree positions are procedurally distributed inside mapped green areas and selected open ground, excluding mapped building footprints, roads and sports pitches. The tree count is a model count, not a tree survey.
- Existing immediate-site geometry is filtered near the proposed tower, and the tower is added as a future-state concept. Surrounding OSM geometry is retained.
- All surroundings use simplified façades; stadium stands and proposed landscaping are interpreted geometry.
- Park labels identify the visible park edge, not its centroid.

The revised apartment mix follows additional user-supplied references: a rectangular two-bedroom render, a narrow studio render, and two rounded corner plans labelled 87.5 m² and 87.0 m². The model interprets their room relationships with four two-bedroom corners, four one-bedroom apartments and four studios. The shared core/corridor footprint is 140 m² (previously 243.6 m²); the core itself is 10.4 × 6.8 m. Displayed apartment areas are gross model polygon areas including terraces, not verified saleable areas or copied reference dimensions.
