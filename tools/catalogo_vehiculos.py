#!/usr/bin/env python3
"""Genera publica/catalogo.js y gestion/catalogo.js: catálogo de marcas y modelos con coincidencia flexible.

Por qué existe: BCA escribe marcas y modelos de mil maneras (CITROEN / CITROËN, LAND-ROVER / LAND ROVER,
«SERIE 3 F30 DIESEL», «CLASE GLA DIESEL X156», «MÉGANE SPORT TOURER DIESEL», «H BRIDO» con la tilde rota…).
El catálogo reduce cada coche a su MARCA y a su MODELO (familia) para los filtros, sin exigir coincidencia exacta:
  - se ignoran mayúsculas, tildes, guiones, espacios y signos («C 3» = «C3», «CX-5» = «CX 5»);
  - da igual que lleven combustible, carrocería o código de generación detrás («SERIE 3 F30 DIESEL» → Serie 3);
  - gana la coincidencia más larga («Transit Connect» antes que «Transit»);
  - lo que no se reconoce NO se descarta: se limpia (sin combustible ni códigos) y se usa tal cual como modelo propio.
El catálogo solo se usa para agrupar en los filtros y para sugerir al escribir; el título del coche sigue siendo el que se publica.

Formato de MARCAS: "Marca": {a: alias de la marca, m: modelos, d: modelo por defecto, x: reglas [regex, plantilla]}
  modelos separados por coma; «Modelo=alias1;alias2» añade otras formas de escribirlo.
Ejecutar al cambiar el catálogo:  python3 tools/catalogo_vehiculos.py
"""
import json, os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

MARCAS = {
    "Abarth": {"m": "500, 595, 695, 124 Spider, Punto Evo, 500e"},
    "Alfa Romeo": {"a": ["Alfa"], "m": "147, 156, 159=Alfa 159, 166, 4C, Brera, Giulia, Giulietta, GT, Junior, MiTo, Spider, Stelvio, Tonale"},
    "Alpine": {"m": "A110, A290"},
    "Aston Martin": {"m": "DB11, DB12, DBX, DBS, Vantage, Vanquish, Rapide"},
    "Audi": {"m": "A1, A2, A3, A4, A5, A6, A7, A8, Cabrio, e-tron, e-tron GT, Q2, Q3, Q4 e-tron, Q5, Q6 e-tron, Q7, Q8, Q8 e-tron, R8, RS3, RS4, RS5, RS6, RS7, RS Q3, RS Q8, S3, S4, S5, S6, S7, S8, SQ5, SQ7, SQ8, TT, TTS, 80, 100, Allroad"},
    "Bentley": {"m": "Bentayga, Continental GT, Flying Spur"},
    "BMW": {"m": "Serie 1, Serie 2, Serie 3, Serie 4, Serie 5, Serie 6, Serie 7, Serie 8, X1, X2, X3, X4, X5, X6, X7, XM, Z3, Z4, Z8, i3, i4, i5, i7, i8, iX, iX1, iX2, iX3, M2, M3, M4, M5, M6, M8, 1M, "
            "R 1250 GS, R 1200 GS, F 800 GS, F 850 GS, G 310 GS, G 650 GS, S 1000 RR, S 1000 R, C 400 GT, C 400 X, C 650 GT",
            "x": [["^([1-8])\\d{2}[A-Z]{0,3}$", "Serie $1"]]},
    "BYD": {"m": "Atto 2, Atto 3, Dolphin, Han, Seal, Seal U, Sealion 7, Tang, Dolphin Surf"},
    "Cadillac": {"m": "ATS, BLS, CTS, Escalade, SRX, XT4, XT5, Lyriq"},
    "Chevrolet": {"m": "Aveo, Camaro, Captiva, Corvette, Cruze, Epica, Kalos, Lacetti, Matiz, Nubira, Orlando, Spark, Tacuma, Trax, Silverado"},
    "Chrysler": {"m": "300C, Grand Voyager, PT Cruiser, Sebring, Voyager, Crossfire, Pacifica"},
    "Citroën": {"a": ["Citroen"], "m": "Ami, Berlingo, C-Crosser, C-Elysée, C1, C2, C3, C3 Aircross, C3 Picasso, C3 Pluriel, C4, C4 Aircross, C4 Cactus, C4 Picasso, C4 SpaceTourer, "
            "Grand C4 Picasso=C4 Grand Picasso, Grand C4 SpaceTourer=C4 Grand SpaceTourer;Grand C4 Spacetourer, C4 X, C5, C5 Aircross, C5 X, C6, C8, DS3, DS4, DS5, Jumper, Jumpy, Nemo, SpaceTourer, Saxo, Xantia, Xsara, Xsara Picasso, ë-C4=e-C4, ë-Jumpy=e-Jumpy, ë-Berlingo=e-Berlingo"},
    "Cupra": {"m": "Ateca, Born, Formentor, León=Leon, Tavascan, Terramar"},
    "Dacia": {"m": "Bigster, Dokker, Duster, Jogger, Lodgy, Logan, Sandero, Spring"},
    "Daewoo": {"m": "Kalos, Lanos, Matiz, Nubira, Tacuma, Leganza, Evanda"},
    "DFSK": {"m": "Glory 500, Glory 580, EC35, Seres 3, Fengon 500"},
    "Dodge": {"m": "Caliber, Challenger, Charger, Journey, Nitro, RAM, Avenger"},
    "DS": {"a": ["DS Automobiles"], "m": "DS 3=DS3;DS 3 Crossback;DS3 Crossback, DS 4=DS4, DS 5=DS5, DS 7=DS7;DS 7 Crossback;DS7 Crossback, DS 9=DS9"},
    "Ferrari": {"m": "296, 458, 488, 812, California, F8, Portofino, Roma, SF90, Purosangue, F12"},
    "Fiat": {"m": "124 Spider, 500, 500C, 500L, 500X, 500e, Bravo, Doblò, Ducato, Fiorino, Freemont, Idea, Linea, Multipla, Panda, Punto=Grande Punto;Punto Evo, Qubo, Scudo, Sedici, Stilo, Strada, Talento, Tipo, Ulysse, Topolino"},
    "Ford": {"m": "B-Max, C-Max=Grand C-Max;Focus C-Max, Ecosport, Edge, Explorer, Fiesta, Focus, Fusion, Galaxy, Ka=Ka+, Kuga, Mondeo, Mustang, Mustang Mach-E, Puma, Ranger, S-Max, Tourneo Connect, Tourneo Courier, Tourneo Custom, Transit, Transit Connect, Transit Courier, Transit Custom, Capri, Bronco, Maverick, Probe, Cougar, Orion, Escort, Streetka, E-Transit"},
    "Honda": {"m": "Accord, City, Civic, CR-V, CR-Z, e, FR-V, HR-V, Insight, Jazz, Legend, Stream, ZR-V, e:Ny1, CBF, CBR 650, NC 750"},
    "Hyundai": {"m": "Accent, Atos, Bayon, Coupé, Elantra, Genesis, Getz, H-1, i10, i20, i30, i40, Ioniq, Ioniq 5, Ioniq 6, ix20, ix35, Kona, Matrix, Nexo, Santa Fe, Sonata, Staria, Terracan, Tucson, Veloster, Trajet, Lantra, H350, Inster"},
    "Infiniti": {"m": "Q30, Q50, Q70, QX30, QX50, QX70, FX, EX, G37"},
    "Isuzu": {"m": "D-Max, Trooper"},
    "Iveco": {"m": "Daily, Eurocargo, Massif"},
    "Jaguar": {"m": "E-Pace, F-Pace, F-Type, I-Pace, S-Type, X-Type, XE, XF, XJ, XK"},
    "Jeep": {"m": "Avenger, Cherokee, Commander, Compass, Gladiator, Grand Cherokee, Patriot, Renegade, Wrangler"},
    "Kia": {"m": "Carens, Carnival, Ceed=Cee'd;Cee´d, Cerato, EV3, EV6, EV9, Magentis, Niro, Optima, Picanto, ProCeed=Pro_Cee'd;Pro Cee'd;Pro_Cee´d, Rio, Sephia, Sorento, Soul, Sportage, Stinger, Stonic, Venga, XCeed, Shuma, Clarus, Pregio"},
    "Lamborghini": {"m": "Aventador, Huracán, Urus, Gallardo, Revuelto"},
    "Lancia": {"m": "Delta, Musa, Thema, Ypsilon, Phedra, Voyager"},
    "Land Rover": {"a": ["Land-Rover", "LandRover"], "m": "Defender, Discovery, Discovery Sport, Freelander, Range Rover, Range Rover Evoque=Evoque, Range Rover Sport, Range Rover Velar=Velar"},
    "Leapmotor": {"m": "T03, C10, C11, B10"},
    "Lexus": {"m": "CT=CT-Serie, ES, GS, IS, LBX, LC, LS, NX=NX-Serie, RC, RX, RZ, UX=UX-Serie, LM"},
    "Lotus": {"m": "Eletre, Elise, Emira, Evora, Exige, Esprit"},
    "Lynk & Co": {"a": ["Lynk", "Lynk Co"], "m": "01, 02, 03, 05"},
    "Mahindra": {"m": "Goa, KUV100, XUV500, XUV300, Pik Up, Scorpio, Thar"},
    "Maserati": {"m": "Ghibli, GranTurismo, Grecale, Levante, Quattroporte, MC20, GranCabrio"},
    "Maxus": {"m": "Deliver 9, eDeliver 3, eDeliver 9, EV80, T60, Mifa 9, eDeliver 7"},
    "Mazda": {"m": "Mazda2=2;Demio, Mazda3=3, Mazda5=5, Mazda6=6, CX-3, CX-30, CX-5, CX-60, CX-7, CX-80, CX-9, MX-30, MX-5, RX-8, BT-50, 323, 626, Premacy"},
    "Mercedes-Benz": {"a": ["Mercedes", "Mercedes Benz"], "m": "Clase A=A, Clase B=B, Clase C=C, Clase E=E, Clase S=S, Clase G=G, Clase V=V, Clase X=X, Clase R=R, Clase M=M, Clase GL=GL, Clase GLK=GLK, Clase CLK=CLK, Clase SLK=SLK, Clase SL=SL, Clase SLC=SLC, "
            "CLA=Clase CLA, CLS=Clase CLS, GLA=Clase GLA, GLB=Clase GLB, GLC=Clase GLC, GLE=Clase GLE, GLS=Clase GLS, AMG GT, EQA, EQB, EQC, EQE, EQS, EQV, Vito, Viano, Sprinter, Citan, Marco Polo, Vaneo, 200-500=200-500 W124, G 63"},
    "MG": {"a": ["Morris Garages"], "m": "MG3, MG4, MG5, HS, ZS, Marvel R, Cyberster, EHS, MGF"},
    "MINI": {"m": "Mini=Cooper;One;Cooper S;Hatch;John Cooper Works, Clubman, Countryman, Cabrio=Convertible, Paceman, Coupé, Roadster", "d": "Mini"},
    "Mitsubishi": {"m": "ASX, Colt, Eclipse Cross, L200, Lancer, Montero, Outlander, Pajero, Space Star, Canter, Carisma, Galant, Grandis, Space Wagon"},
    "Nissan": {"m": "350Z, 370Z, Almera, Ariya, Cabstar, Cube, GT-R, Interstar, Juke, Leaf, Micra, Murano, Navara, Note, NV200=e-NV200, NV300, NV400, Pathfinder, Pixo, Primastar, Primera, Pulsar, Qashqai, Terrano, Townstar, X-Trail, Patrol, Evalia"},
    "Opel": {"m": "Adam, Agila, Ampera, Antara, Astra, Cascada, Combo, Combo Life, Corsa, Crossland=Crossland X, Frontera, Grandland=Grandland X, Insignia, Karl, Meriva, Mokka=Mokka X, Movano, Signum, Tigra, Vectra, Vivaro, Zafira, Zafira Life, Omega, Calibra, Monterey, Rocks-e"},
    "Peugeot": {"m": "106, 107, 108, 205, 206, 207, 208=e-208, 301, 306, 307, 308, 405, 406, 407, 508, 607, 807, 1007, 2008=e-2008, 3008, 4007, 4008, 5008, Bipper, Boxer, Expert=e-Expert, Kisbee, Partner, RCZ, Rifter, Traveller=e-Traveller, iOn, Ranch, Landtrek"},
    "Polestar": {"m": "Polestar 1=1, Polestar 2=2, Polestar 3=3, Polestar 4=4"},
    "Porsche": {"m": "718, 911, 944, Boxster, Cayenne, Cayman, Macan, Panamera, Taycan, 928"},
    "Renault": {"m": "Arkana, Austral, Captur, Clio, Espace, Express, Fluence, Kadjar, Kangoo, Koleos, Laguna, Master, Mégane, Modus, Rafale, Scénic=Grand Scénic, Symbioz, Talisman, Trafic, Twingo, Twizy, Wind, Zoe, Safrane, Vel Satis, Avantime, Alpine, 4, 5, Mascott, Clio Campus"},
    "Rover": {"m": "25, 45, 75, 200, 400, 600, Streetwise, Mini"},
    "Saab": {"m": "9-3, 9-5, 900, 9000"},
    "SEAT": {"m": "Alhambra, Altea=Altea XL;Altea Freetrack, Arona, Ateca, Córdoba, Exeo, Ibiza, León=Leon;Nuevo León, Marbella, Mii, Tarraco, Toledo, Arosa, Inca, Malaga"},
    "Skoda": {"a": ["Škoda"], "m": "Citigo, Elroq, Enyaq, Fabia, Kamiq, Karoq, Kodiaq, Octavia, Rapid, Roomster, Scala, Scout, Spaceback, Superb, Yeti, Felicia, Favorit"},
    "Smart": {"m": "ForTwo, ForFour, Roadster, #1, #3, EQ ForTwo, EQ ForFour"},
    "SsangYong": {"a": ["KGM", "KGM / SsangYong", "KGM SsangYong", "KG Mobility"], "m": "Actyon, Korando, Kyron, Musso, Rexton, Rodius, Tivoli, Torres, XLV, Tivoli Grand"},
    "Subaru": {"m": "BRZ, Crosstrek, Forester, Impreza, Justy, Legacy, Levorg, Outback, Solterra, Tribeca, WRX, XV, Trezia"},
    "Suzuki": {"m": "Across, Alto, Baleno, Celerio, Grand Vitara, Ignis, Jimny, Kizashi, S-Cross=SX4 S-Cross, Splash, Swace, Swift, SX4, Vitara, Wagon R, Samurai, Liana, GSX-S 750, Intruder"},
    "Tesla": {"m": "Model 3, Model S, Model X, Model Y, Cybertruck"},
    "Toyota": {"m": "Auris, Avensis, Aygo, Aygo X, bZ4X, C-HR, Camry, Corolla, Corolla Cross, GR86, GR Yaris, GT86, Hiace, Highlander, Hilux, iQ, Land Cruiser, Mirai, Prius, Proace, Proace City, Proace Verso, Previa, RAV4=RAV-4, Supra, Urban Cruiser, Verso=Corolla Verso, Yaris, Yaris Cross, MR2, Celica, Starlet, Picnic"},
    "Volkswagen": {"a": ["VW"], "m": "Amarok, Arteon, Beetle=Escarabajo, Bora, Caddy, California, Caravelle, CC=Passat CC, Crafter, Eos, Fox, Golf, ID.3, ID.4, ID.5, ID.7, ID. Buzz=ID.Buzz;ID Buzz, Jetta, Lupo, Multivan, Passat, Phaeton, Polo, Scirocco, Sharan, T-Cross, T-Roc, Taigo, Tayron, Tiguan, Touareg, Touran, Transporter, Up=Up!;e-Up, Vento, Taos, Karmann Ghia, Corrado, LT"},
    "Volvo": {"m": "C30, C40, C70, EC40, EX30, EX40, EX90, S40, S60, S70, S80, S90, V40, V50, V60, V70, V90, XC40, XC60, XC70, XC90, 850, 940, 960"},
    # motos que aparecen en BCA (se agrupan por marca; el modelo se queda como viene)
    "Yamaha": {"m": "MT-07, MT-09, Tracer 9, Tracer 700, XMAX, TMAX, NMAX, R1, R6, Ténéré 700"},
    "Kawasaki": {"m": "Z650, Z900, Ninja 650, Ninja 400, Versys 650, Vulcan S"},
    "Ducati": {"m": "Monster, Multistrada, Panigale, Scrambler, Diavel, Streetfighter"},
    "Piaggio": {"m": "Beverly, Liberty, MP3, Medley, Vespa"},
}

# palabras que BCA añade al modelo y que no forman parte de su nombre (combustible, carrocería, versión)
RUIDO = ("DIESEL DIESEL GASOLINA GAS HIBRIDO ENCHUFABLE ECHUFABLE PLUG IN HYBRID PHEV HEV MHEV EV ELECTRICO ELECTRICA BRIDO H "
         "FURGON COMBI VAN KOMBI CHASIS CABINA CAMION PICK UP 3P 4P 5P SEDAN SPORTBACK SPORTBREAK SPORT TOURER TOURING ESTATE SW CABRIO "
         "COUPE GRAN TURISMO LCI M1 ALLSPACE VARIANT FREETRACK HATCHBACK WAGON SPORTSEDAN SPORTWAGON").split()

MOTOR = r"""
(function(){
const RUIDO=%RUIDO%;
const D=%DATOS%;
const N=s=>String(s==null?"":s).toUpperCase().replace(/\+/g," PLUS ").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Z0-9]+/g," ").trim();
const SQ=s=>N(s).replace(/ /g,"");
const RU=new Set(RUIDO);
const CODIGO=/^[A-Z]{1,2}\d{2,3}[A-Z]?$/, ROMANO=/^(II|III|IV|V|VI|VII|VIII)$/;
const MARCAS={},MAPA={};
for(const [nombre,d] of Object.entries(D)){
  const b={nombre,toks:new Set(),map:{},lista:[],def:d.d||null,rx:(d.x||[]).map(([r,t])=>[new RegExp(r),t])};
  for(const k of [nombre,...(d.a||[])]){MAPA[SQ(k)]=nombre;N(k).split(" ").forEach(t=>t&&b.toks.add(t))}
  for(const e of String(d.m||"").split(",")){const [c,al]=e.split("=");const canon=c.trim();if(!canon)continue;b.lista.push(canon);
    for(const k of [canon,...(al?al.split(";"):[])]){const s=SQ(k);if(s&&!b.map[s])b.map[s]=canon}}
  MARCAS[nombre]=b}
const titulo=s=>s.split(" ").filter(Boolean).map(t=>/\d/.test(t)||t.length<=2?t:t[0]+t.slice(1).toLowerCase()).join(" ");
function marca(raw){const n=N(raw);if(!n||/^(NUEVO COCHE|-)$/.test(n))return"";const s=n.replace(/ /g,"");if(MAPA[s])return MAPA[s];
  // «KGM / SSANGYONG», «VOLKSWAGEN VEHICULOS COMERCIALES»…: si empieza por una marca conocida, es esa
  const t=n.split(" ");for(let k=Math.min(3,t.length);k>=1;k--){const p=t.slice(0,k).join("");if(MAPA[p])return MAPA[p]}
  for(const m of Object.keys(MAPA)){if(s.length>5&&m.length>5&&(s.indexOf(m)>=0))return MAPA[m]}
  return titulo(n)}
function limpiar(toks){const o=[];toks.forEach((t,i)=>{if(i===0||!(RU.has(t)||CODIGO.test(t)||ROMANO.test(t)))o.push(t)});return o}
function buscar(b,toks){let mejor=null;
  for(let off=0;off<=2&&off<=toks.length;off++){
    if(off>0){const p=toks[off-1];if(!(b.toks.has(p)||CODIGO.test(p)))break}
    for(let k=1;k<=4&&off+k<=toks.length;k++){const s=toks.slice(off,off+k).join("");const c=b.map[s];
      if(c){const pt=s.length*10-off;if(!mejor||pt>mejor.pt)mejor={pt,c}}}}
  return mejor&&mejor.c}
function modelo(marcaC,raw){const toks=N(raw).split(" ").filter(Boolean);if(!toks.length)return"";
  const b=MARCAS[marcaC];
  if(b){const sin=toks.slice();while(sin.length>1&&b.toks.has(sin[0]))sin.shift();
    const c=buscar(b,toks)||buscar(b,sin);if(c)return c;
    for(const [r,t] of b.rx){const m=sin[0].match(r);if(m)return t.replace("$1",m[1])}
    if(b.def)return b.def;
    const l=limpiar(sin);return titulo(l.join(" "))}
  return titulo(limpiar(toks).join(" "))}
const COMB=[[/ENCHUFABLE|PLUG|PHEV/,"Híbrido enchufable"],[/ELECTRIC|^EV$|BEV/,"Eléctrico"],[/HIBRID|HYBRID|HEV/,"Híbrido"],[/DIESEL|DIESE|GASOIL|TDI|CDI/,"Diésel"],[/GLP|GNC|GNL|AUTOGAS|^GAS$/,"GLP/GNC"],[/GASOLINA|PETROL|BENZIN|TSI|TFSI/,"Gasolina"]];
function combustible(raw){const n=N(raw);if(!n||n==="-")return"";for(const [r,v] of COMB)if(r.test(n))return v;return titulo(n)}
const COL=[[/ROJ/,"Rojo"],[/AZUL/,"Azul"],[/NEGR/,"Negro"],[/BLANC/,"Blanco"],[/PLATA/,"Plata"],[/GRIS|GREY|GRAY|ANTRACITA/,"Gris"],[/VERD/,"Verde"],[/MARRON|BROWN|CAFE|CHOCOLATE/,"Marrón"],[/BEIGE|CREMA/,"Beige"],[/NARANJA|ORANGE/,"Naranja"],[/AMARILL|YELLOW/,"Amarillo"],[/BURDEOS|GRANATE|VINO/,"Burdeos"],[/CHAMPAGNE|CHAMPAN/,"Champán"],[/ORO|DORAD|GOLD/,"Dorado"],[/MORAD|VIOLETA|PURPURA/,"Morado"],[/ROSA/,"Rosa"]];
function color(raw){const n=N(raw);if(!n)return"";for(const [r,v] of COL)if(r.test(n))return v;return titulo(n.replace(/\b(METALIZAD[OA]|PERLAD[OA]|NACARAD[OA]|MATE)\b/g,"").trim())}
const marcas=Object.keys(MARCAS).sort((a,b)=>a.localeCompare(b,"es"));
window.HUELSAN_CAT={marca,modelo,combustible,color,marcas,modelos:m=>(MARCAS[m]?MARCAS[m].lista.slice():[]),N};
})();
"""


def main():
    datos = {k: {kk: vv for kk, vv in v.items()} for k, v in MARCAS.items()}
    js = ("/* Catálogo de marcas y modelos (generado por tools/catalogo_vehiculos.py: no editar a mano) */\n"
          + MOTOR.replace("%RUIDO%", json.dumps(RUIDO, ensure_ascii=False))
                 .replace("%DATOS%", json.dumps(datos, ensure_ascii=False, separators=(",", ":"))))
    n_mod = sum(len([m for m in v["m"].split(",") if m.strip()]) for v in MARCAS.values())
    for carpeta in ("publica", "gestion"):
        with open(os.path.join(RAIZ, carpeta, "catalogo.js"), "w", encoding="utf-8") as f:
            f.write(js)
    print(f"{len(MARCAS)} marcas, {n_mod} modelos -> publica/catalogo.js y gestion/catalogo.js ({len(js)//1024} KB)")


if __name__ == "__main__":
    main()
