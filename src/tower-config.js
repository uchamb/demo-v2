// Concept floor numbering for the four visible volumes; not a verified schedule.
export const TOWER_SECTIONS = [
  { id: 1, name: 'Section 01', bottom: 12, top: 65, firstFloor: 1, lastFloor: 16 },
  { id: 2, name: 'Section 02', bottom: 70, top: 122, firstFloor: 17, lastFloor: 32 },
  { id: 3, name: 'Section 03', bottom: 127, top: 179, firstFloor: 33, lastFloor: 48 },
  { id: 4, name: 'Section 04', bottom: 184, top: 260, firstFloor: 49, lastFloor: 70 },
].map(section => ({ ...section, floorHeight: (section.top - section.bottom) / (section.lastFloor - section.firstFloor + 1) }));

export function floorAtHeight(section, y) {
  if (y < section.bottom || y > section.top) return null;
  return Math.min(section.lastFloor, section.firstFloor + Math.floor((y - section.bottom) / section.floorHeight));
}

export function roundedOutline(width = 33, depth = 28, radius = 8) {
  const points = [];
  for (const [x, z, start] of [[width/2-radius,depth/2-radius,0],[-width/2+radius,depth/2-radius,90],[-width/2+radius,-depth/2+radius,180],[width/2-radius,-depth/2+radius,270]]) {
    for (let i=0;i<=12;i++) {
      const angle=(start+i*90/12)*Math.PI/180;
      points.push([x+Math.cos(angle)*radius,z+Math.sin(angle)*radius]);
    }
  }
  return points;
}
