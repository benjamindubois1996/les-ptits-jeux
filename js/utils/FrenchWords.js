/**
 * FrenchWords — liste de mots français courants pour les jeux de lettres (Boggle, Anagrammes).
 * Mots sans accents pour simplifier la saisie et la génération de grilles.
 */

const RAW = `
eau feu jeu peu art air ami rue mer roi sol sel lac lit loi moi mot mur nid nom riz
sac son sou toi ton ver vie vue oui non pas par sur car fin nez dos cap cou pot bus
bar but dix ski tir vol vif bol bec pou vin ile arc age pur cru pre bas sec gel jus
gaz ego sue use ose tue due mue pue ode axe sus une uni bon con don ion ici dru elu
emu ble cle ete cas les mes des tes ses eux ils las ans vis bis dis lis mis pis ris
aid aim and boa boa cal dam duc era fac fer feu foi fur gag gin got gue gut lac las
let lis lot lux mec mel mob mug mut nef nue nul ode pal pan pec pel per pis pol pom
pop poi pot pou pre pro pub rif rig roc rot rut sal sau sir sis soc som sop sot spa
sue sup tan tao tar tat tau tec ter tic tin tod toc tuf tun vac val van var vas vet
via vid vit voc wok yak yam yen yin zap zas zig
acne acre acte agir aide aime aire aise alto amas amen amer amis amok ange anti apre
arcs ardu arme arpe arts ardu ardu aspe assi auto avec aveu aven avis avon azur baie
bale bals bane bare bari bask bass baux beau becs belo bete bien bile bise bite blee
bloc boca bome bord bore born bose boss bote bots bouc boue bouf boul boum bour bous
bras burg buse cafe cage cale cali calm cane caps care cart case cave cela cent cepe
cere cers ceux choc ciel cime cite clam clef clou club coce cocu cola cole coli colo
cola come cone cors cote coue coup cour crap crew crue cube cure dace dais dale dame
dans dare date dauw deco demi dent deux deve dieu diez dise diva dive dome done dont
dore dors dose dote doux drac drap dres drim drip droe drop drue duel dune dure egal
edit egre else emer emit enol envi epee epis eras ergo erne erro espe etai etat etau
etoc etui eves evin expo face fade fado fail fake fame fare fast faux feau feel fier
fils finc fino fion fisc fisc fisc flee flic flip flop flux fole foli fond fore fort
fose foto fous frac frai frai frit froe froc froe from front fume fusi gala gale gali
galp gane gape gare gave gaze gean gele gels gens geol gere gibe gite glad glas glee
glui gnom gnon gobe goma gore gouf goum gour gras grem gres gris gros grue guet gull
hale hall halo halo hame hami hano hant haro hase hast haut have havre hide hile hist
homo hone hono hore hors host hote hotl houe houx huit hune hure hypo ible ical idem
idle ilet ills ilot ilot imbu inca inde indi info inox into iris iron isla isme ispe
item iter ives ixia jade jaie jamb jans jase jean jean joli jone jota joue jour joux
juif jupe jury juta jute lace lacs lade laie lake lame lamp lard lare lars lase lath
laxi laye leal lege lene lieu lile lima lime limn lioc liom lira lirc lire loge loin
lome long lori lors lote lotm lots loup loue loui lour lout luge lune lunt lupo lure
luth luze mace mage mahi maie main mais mala male malm malt mama mane mani mare mari
mars mast mate mats maze mese mets midi mile mili mime mine mire mise mite mode moil
mole mono mont mora more mors mort mote moue mout moxa muet mule muni mure musc muse
must mute nage naif naif naig nail nais nale nami nane napo nare nase nave nerf nero
neve nevo nice nidi niel nile nils noir noix nome nori norm nota note nous nude nuer
nuit null odal odet oint olio ollo onde onze opah opax oral orca orca orge orle orme
oros oser otan otom oudi ouie oule oups ourn ours oust oute ouzo oval oxer oxid oxis
pace paco pale pali pall palp pane papi park part pase passe paup pave pean peau pege
pele peni pepe perl pero pers pese peso pest peul pian pied pied pies pier pile pine
pion pipe pire pitl pive pixe plac plan play plot plis ploe plom plop plot plub plum
plus poel poin pois pome popa pope pore port pose posi poum pour pout poux prex pria
pris prix proc prop pros prut pubs pure puri pusc puss race rade rafe rale rame rami
rana rand rang rape rare rase rate ratu rave raze reau reel rein rele remi rent rial
riba ride rien rieu rife rift rima rire risc rite rive riza robe roc roie role roma
rome romi ronce rond rong rone rori rose roue roue rouf rout roux rude ruer ruse ruta
sacs sage sago sale same sana sang sari sari sass sauf saum saun saut saux save saxe
seau sebc seel seif seis semi sens sera serf sers siel simt sine siro site soie sole
soma sope sori sorl sors sote soue soud soue soul soum soum soup sous stra sube subt
suck suie suis sume sung suno supe sure surf suri suto syne taco tael taha taie tale
tali talm tame tani tant tape tard tare taro taud taux taxe tees tein tel tele tens
tent terp test tetu tide tien tiga tilt time tire tisn titre told tome tona tons tope
tors tort toto toue toui toux tram tres tric tris troc trop trot trou true tsar tuba
tuba tubu tune turb tusc type udon ultra unde undo unit upas urne urso user vale vaut
vale vali valm vane vans veau vela veld velo veni vers veto vide viol visa vite vivo
voeu vogu voie voir vola vole vont vote voue vrac vrau vuie
abces abime abord abyme acces achat acide acier actes actif adieu album alors amant
amour ample ancre angel angle anime annee apero apres arbre arche ardeu areve armer
asile assez assur atome atten avant avare avide avoir avoir bague balle bande barre
batir baton benne beret berne beton bidon bijou bilan bille blanc blase bless bleus
boire boite bombe bonde bonne bonne borde borse bosse boite botte bouge boule bourg
brise brute buche bugne buter butin cache cadet caeur calme canal canne canon carge
carte cause caves ceint celer celue champ chant chaud choix chose choux cible circe
clair clair clame clous coeur coloc comme compo conte copie coude coule coupe cours
court crane creux crime crise crois cruel cuite cycle cepes ceder corps defer dense
depot deuil digne direr doigt doyen droit ducat duvet ebats eches eclat eclip ecole
eclou eleve emane emule ennui entre epais epave etage etude ethyl eveil evite exact
fable fache farce faune feber fesse fibre fiche fiere filet fille final fleur foret
force forme fosse fouet foyer franc frere front fugue fusil garce genre glace grace
grain grand grave greve herbe heure hiver honte hotel hurle hyene impur immix index
infer inoui inter iront isole jeter jouet jouer joute juger jurer kiosk lacer lapin
large larme laser later leche lente liber libre limon linge lisse livre loger logis
louer lumie lundi lutte magie malin mares masse matin merci metre meurt mince mirez
monde moral motif moule moyen musee nappe negre neige niveau niche noble noire noisy
nonce norme noter noyer objet ocean odeur olive ombre oncle opera ordre oreme ortie
outre paire padie palea palpe parle patin pause pearl peine pente perdu perle petit
pince pique place plage plain plein plume poche poeme point pomme porte poser pouce
poule prana prime prose prune puant queue racer radie radio raide raisin rayon reche
repas repos retif retir retou retur reuse revue rider rigou rieur riote rival rodeo
ronge rouge sabli sacre saint salle salon sauce scene seche selon serum signe sinon
sobre soeur soixe somme sorte sport stade store style sucre suite sujet suler talon
tapis tarte techn temps tenue terme terre tiede timid titre toile tombe tonne total
tours train trait tribu trime trone trous tuile tumor turbu usage utile vague valve
valse vaste veine verre verso vieil vieux vigne villa viner vitre vivre voile votre
aborde abuser accent accuse actuel adapter adroit aguets aident aigrir aimer ajoute
albums alerte aligne aliter allier alloue alours amener amical aminci annexe annuler
apicer apiece apteur araque archer argent armure arquer arroge artere asseor assise
attire attrait aucune avaler avouer bagage baisser balcon bander barrer bavard beaute
besoin beurre billet bisque bloque bouche bouger bouton bruler bruner brunet brusque
bucher cabine caleur canard carnet casque centre cerise chaise chasse chemin chevre
choisir client cloche coffre combat commun compte copain coulor cousin danger debout
dehors delice denude desir detail devant divine domino dormir dossier dresser eclair
effort encore entier eposer eriger espoir esprit etoffe etoile etroit faveur fiance
ferme fievre fleuve fraise friper fromage fuyard gagner garder givrer gloire gorge
hasard hivern humble jardin justice lancer lavage legume lessen libere leurre livrer
louche maison malice manque marche meuble milieu miroir monde montee moulin mousse
mouton munir nation nature navire neveux niveau noble obeir obtenu oiseau orange
palier palme pardon parler partir patron peuple phrase pierre planer piquet platane
poignet poison poulet poumon prison projet propre raison raller regard retour rideau
risque rivage rocher ruelle savant saluer secret semble signal soleil sortir spirale
statue timbre tomber tordre triste trouve tunnel valeur verset violet visage voyage
abricot annonce appeler attaque balance biscuit buisson cadeaux camarade capable
chambre chanson cheveux colonel courage cuisine culture debuter declare demande destin
eclipse fantome fatigue fenetre garnir gestion grimper harmonie hopital journal
lecture legumes liberte logique lumiere mariage memoire mission motiver muscler
nouveau obtenir origine parfait passion perdant poisson pouvoir premier prendre
produit raconte rapport recette recolte resultat sagesse saisons service silence
soldate sorcier spirale theatre tonnerre toucher traiter tremble trouble univers
utiliser valider verdure versant village violent visiter vivace voyageur
`.trim().split(/\s+/).filter(w => w.length >= 3 && /^[a-z]+$/.test(w));

export const WORDS = new Set(RAW);

/** Vérifie si un mot est dans la liste */
export function isValid(word) {
  return WORDS.has(word.toLowerCase().trim());
}

/**
 * Retourne tous les mots valides formables à partir d'un ensemble de lettres.
 * Chaque lettre de `letters` peut être utilisée au plus autant de fois qu'elle apparaît.
 * @param {string[]} letters - tableau de lettres (minuscules ou majuscules)
 * @returns {string[]}
 */
export function wordsFromLetters(letters) {
  const results = [];
  const lc = letters.map(l => l.toLowerCase());
  const available = {};
  for (const l of lc) available[l] = (available[l] || 0) + 1;

  for (const word of WORDS) {
    if (word.length < 3) continue;
    const needed = {};
    let ok = true;
    for (const ch of word) {
      needed[ch] = (needed[ch] || 0) + 1;
      if (needed[ch] > (available[ch] || 0)) { ok = false; break; }
    }
    if (ok) results.push(word);
  }
  return results.sort((a, b) => b.length - a.length);
}
