// Runtime axis check against the installed web-ifc, independent of PV formulas.
import path from "node:path";
import { IfcAPI } from "web-ifc";
import { elementTriangles } from "./lib/ifc-face-area.mjs";

const source = `ISO-10303-21;
HEADER;FILE_DESCRIPTION(('ViewDefinition [DesignTransferView]'),'2;1');
FILE_NAME('north-axis.ifc','2026-09-07T00:00:00',(''),(''),'','','');FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#2=IFCUNITASSIGNMENT((#1));
#3=IFCCARTESIANPOINT((0.,0.,0.));
#4=IFCDIRECTION((0.,0.,1.));
#5=IFCDIRECTION((1.,0.,0.));
#6=IFCAXIS2PLACEMENT3D(#3,#4,#5);
#7=IFCLOCALPLACEMENT($,#6);
#8=IFCCARTESIANPOINT((0.,10.));
#9=IFCAXIS2PLACEMENT2D(#8,$);
#10=IFCRECTANGLEPROFILEDEF(.AREA.,$,#9,2.,2.);
#11=IFCEXTRUDEDAREASOLID(#10,#6,#4,2.);
#12=IFCSHAPEREPRESENTATION(#16,'Body','SweptSolid',(#11));
#13=IFCPRODUCTDEFINITIONSHAPE($,$,(#12));
#14=IFCSLAB('0AbcdEfghIjklMnoPqrstU',$,'North-axis fixture',$,$,#7,#13,$,.FLOOR.);
#15=IFCPROJECT('1AbcdEfghIjklMnoPqrstU',$,'Axis check',$,$,$,$,(#16),#2);
#16=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,0.00001,#6,#17);
#17=IFCDIRECTION((0.,1.));
ENDSEC;END-ISO-10303-21;`;
const api = new IfcAPI();
api.SetWasmPath(path.join(process.cwd(), "node_modules/web-ifc/") + path.sep, true);
await api.Init();
const model = api.OpenModel(new TextEncoder().encode(source));
try {
  const points = elementTriangles(api, model, api.GetFlatMesh(model, 14)).flat();
  if (!points.length) throw new Error("Axis fixture produced no source geometry");
  const min = [0, 1, 2].map((axis) => Math.min(...points.map((p) => p[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...points.map((p) => p[axis])));
  console.log(JSON.stringify({ ifcCentre: [0, 10, 1], worldCentre: min.map((v, i) => (v + max[i]) / 2), min, max }));
} finally { api.CloseModel(model); }
