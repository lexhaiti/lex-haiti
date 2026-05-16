"""Five Moniteur issues to ingest in one batch.

Hand-transcribed from the supplied PDF scans — Claude read the
originals, captured the structural metadata (year, number, edition
label, director, publication date, signers) and the body text of
each entry.

What's deliberately NOT in here:

  * Trademark register entries, vérification de billets, statistique
    de l'enregistrement, demandes de ferme — the 1936 N° 40 issue
    has many of these and they belong on the issue's *sommaire* page
    but not as separately-promotable entries. The editor can add them
    case-by-case later via /editorial/moniteur.

  * Signature blocks at the end of each act — captured in the running
    ``raw_text`` body but not separately structured. Promote-to-legal-
    text time is when ``LegalSigner`` rows get parsed out.

The script ``scripts/ingest_moniteur_batch.py`` consumes this module.
Re-running is idempotent: each issue is UPSERTed on (year, number)
and each entry is UPSERTed on (issue_id, position).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date


@dataclass
class EntryData:
    position: int
    detected_category: str  # MoniteurDocumentType value
    display_title: str
    detected_title: str
    detected_number: str | None
    detected_date: date | None
    summary_fr: str
    raw_text: str
    page_from: int | None = None
    page_to: int | None = None
    # When this entry is a companion of another within the same
    # issue — a presidential promulgation of a loi, an arrêté that
    # implements a CPT résolution, a translator's note — set this
    # to the parent's ``position`` and the ingest script will wire
    # ``parent_entry_id`` after both rows exist. None = top-level.
    parent_position: int | None = None


@dataclass
class IssueData:
    number: str
    year: int
    publication_date: date
    edition_label: str | None
    director: str | None
    director_role: str | None
    file_url: str  # relative to backend/, resolved to absolute at ingest time
    page_count: int | None
    entries: list[EntryData] = field(default_factory=list)


# ──────────────────────────────────────────────────────────────────────
# Moniteur N° 40 — Jeudi 7 mai 1936 — 91ème Année
# Director: Candelon Rigaud
# ──────────────────────────────────────────────────────────────────────
ISSUE_1936_40 = IssueData(
    number="40",
    year=1936,
    publication_date=date(1936, 5, 7),
    edition_label=None,
    director="Candelon Rigaud",
    director_role="Directeur",
    file_url="data/scans/moniteur-1936-40.pdf",
    page_count=8,
    entries=[
        EntryData(
            position=0,
            detected_category="loi",
            display_title=(
                "Loi ouvrant un crédit extraordinaire de Gdes 113.000 pour "
                "l'embellissement et la viabilité de l'Avenue du Président Trujillo"
            ),
            detected_title="Loi du 5 mai 1936",
            detected_number=None,
            detected_date=date(1936, 5, 5),
            summary_fr=(
                "Ouverture d'un crédit extraordinaire de Cent Treize Mille Gourdes "
                "(Gdes 113.000) au Département des Travaux Publics pour "
                "l'aménagement de l'Avenue du Président Trujillo (ex-Rue "
                "Républicaine), travaux déclarés d'utilité publique."
            ),
            page_from=1,
            page_to=1,
            raw_text=(
                "STENIO VINCENT, PRÉSIDENT DE LA RÉPUBLIQUE.\n\n"
                "Vu l'article 21 de la Constitution ;\n"
                "Vu l'arrêté de l'Administration Communale de Port-au-Prince en date "
                "du 2 Mai 1936 dénommant la Rue Républicaine « Avenue du Président "
                "Trujillo » ;\n"
                "Vu les articles 4 et 5 de la loi du 27 Juin 1935 sur le Budget et "
                "la Comptabilité Publique ;\n"
                "Considérant que le Généralissime Docteur Raphaël Léonidas Trujillo "
                "Y Molina, Président de la République Dominicaine et Bienfaiteur de "
                "Sa Patrie, a réalisé d'accord avec le Chef du Gouvernement Haïtien, "
                "Son Excellence Monsieur Sténio Vincent, cette œuvre importante "
                "d'amitié internationale ;\n"
                "Considérant qu'en donnant à la principale Avenue de Port-au-Prince "
                "le nom du Chef illustre de la République Sœur, l'Administration "
                "Communale de Port-au-Prince a rendu à ce Grand Serviteur de la Paix "
                "entre les nations un hommage auquel il importe d'associer le Corps "
                "Législatif ;\n"
                "Considérant qu'il est nécessaire de procéder sans retard aux travaux "
                "d'urbanisme indispensables pour un aménagement conforme de la dite "
                "Avenue ;\n"
                "Considérant que le Budget de l'Exercice en cours ne comporte pas "
                "les allocations nécessaires, et qu'il est urgent d'y pourvoir ;\n"
                "Sur le Rapport des Secrétaires d'État de l'Intérieur et des Travaux "
                "Publics ; De l'avis écrit et motivé du Secrétaire d'État des "
                "Finances ; Et après délibération en Conseil des Secrétaires d'État ;\n\n"
                "A proposé, et le Corps Législatif a voté d'urgence la loi suivante :\n\n"
                "Article 1er.— Il est ouvert au Département des Travaux Publics un "
                "crédit extraordinaire de Cent Treize Mille Gourdes (Gdes 113.000) "
                "en vue des travaux d'urbanisme nécessaires pour l'embellissement et "
                "la viabilité de l'Avenue du Président Trujillo.\n"
                "Article 2.— Les dits travaux sont déclarés d'utilité publique.\n"
                "Article 3.— Les voies et moyens du crédit seront tirés des "
                "disponibilités du Trésor Public.\n"
                "Article 4.— La présente loi sera exécutée à la diligence des "
                "Secrétaires d'État de l'Intérieur, des Travaux Publics et des "
                "Finances, chacun en ce qui le concerne.\n\n"
                "Donné au Palais de la Chambre des Députés, à Port-au-Prince, ce 5 "
                "Mai 1936, an 133ème de l'Indépendance, 2ème de la Libération et de "
                "la Restauration.\n"
                "Le Président : DUM. ESTIME — Les Secrétaires : ED. PIOU, A. NELSON\n\n"
                "Donné à la Maison Nationale, à Port-au-Prince, le 7 Mai 1936, an "
                "133ème de l'Indépendance, 2ème de la Libération et de la "
                "Restauration.\n"
                "Le Président : LS. S. ZEPHIRIN — Les Secrétaires : FOMBRUN, JH. "
                "RAPHAEL NOEL"
            ),
        ),
        EntryData(
            position=1,
            detected_category="promulgation",
            parent_position=0,
            display_title=(
                "Promulgation de la Loi du 5 mai 1936 ouvrant un crédit "
                "extraordinaire pour l'Avenue du Président Trujillo"
            ),
            detected_title="Promulgation présidentielle du 7 mai 1936",
            detected_number=None,
            detected_date=date(1936, 5, 7),
            summary_fr=(
                "Acte exécutif par lequel le Président Sténio Vincent ordonne "
                "que la Loi votée par le Corps Législatif soit revêtue du "
                "Sceau de la République, imprimée, publiée et exécutée."
            ),
            page_from=1,
            page_to=1,
            raw_text=(
                "AU NOM DE LA RÉPUBLIQUE.\n\n"
                "Le Président de la République ordonne que la Loi ci-dessus "
                "soit revêtue du Sceau de la République, imprimée, publiée "
                "et exécutée.\n\n"
                "Donné au Palais National, à Port-au-Prince, le 7 Mai 1936, "
                "An 133ème de l'Indépendance et 2ème de la Libération et de "
                "la Restauration.\n\n"
                "STENIO VINCENT — Par le Président : Le Secrétaire d'État "
                "de l'Intérieur : JH. TITUS ; Le Secrétaire d'État des "
                "Travaux Publics : R. BROUARD ; Le Secrétaire d'État des "
                "Finances : MONT-ROSIER DEJEAN."
            ),
        ),
        EntryData(
            position=2,
            detected_category="arrete",
            display_title=(
                "Arrêté modifiant l'article 1er de l'Arrêté du 22 Mai 1935 relatif "
                "à l'indication d'origine sur les marchandises importées"
            ),
            detected_title="Arrêté du 7 mai 1936",
            detected_number=None,
            detected_date=date(1936, 5, 7),
            summary_fr=(
                "Modification de l'article 1er de l'Arrêté du 22 Mai 1935 sur "
                "l'indication du nom géographique du pays d'origine des "
                "marchandises importées, et prolongation du délai d'application au "
                "27 mai 1936."
            ),
            page_from=1,
            page_to=2,
            raw_text=(
                "STENIO VINCENT, PRÉSIDENT DE LA RÉPUBLIQUE.\n\n"
                "Vu l'article 35 de la Constitution ;\n"
                "Vu la loi du 15 Avril 1935 concernant le tarif minimum et le tarif "
                "maximum des droits d'importation ;\n"
                "Vu l'arrêté du 22 Mai 1935 déterminant les conditions que doivent "
                "réunir les marchandises, articles ou produits importés pour "
                "bénéficier du tarif minimum des droits d'importation ;\n"
                "Vu l'arrêté du 20 Août 1935 abrogeant l'article 3 de l'arrêté du 22 "
                "Mai 1935 ;\n"
                "Vu l'arrêté du 14 Décembre 1935 abrogeant l'article 2 de l'arrêté "
                "du 20 Août 1935 ;\n"
                "Considérant que l'expérience a démontré que les termes de l'arrêté "
                "du 22 Mai 1935 peuvent être modifiés en ce qui a trait à la manière "
                "d'indiquer la provenance géographique des marchandises, articles ou "
                "produits importés ;\n"
                "Considérant qu'il y a donc lieu de modifier l'article 1er de "
                "l'arrêté du 22 Mai 1935 ;\n"
                "Sur le rapport du Secrétaire d'État des Finances et du Commerce ; "
                "Et après délibération en Conseil des Secrétaires d'État ;\n\n"
                "Arrête :\n"
                "Article premier.— L'article 1er de l'arrêté du 22 Mai 1935 est "
                "modifié comme suit :\n"
                "« Les marchandises, articles ou produits importés, admis à jouir du "
                "bénéfice du tarif minimum des droits d'importation, devront "
                "comporter, bien en évidence, directement sur la marchandise, "
                "l'article ou le produit même, ou — à moins que les règlements "
                "douaniers ne le défendent expressément — sur son emballage "
                "immédiat, ou sur tout contenant faisant partie du poids imposable "
                "de la marchandise, de l'article ou du produit, le nom géographique, "
                "en français, en anglais ou en espagnol, du pays d'origine. Le pays "
                "d'origine sera considéré comme indiqué par la désignation du nom "
                "géographique d'un pays déterminé, ou d'un dominion, colonie, "
                "possession, protectorat, ou pays sous mandat, en dehors de la "
                "frontière de la métropole. Ce nom géographique peut être marqué, "
                "imprimé, gravé, pyrogravé, estampé ou étiqueté, et devra être aussi "
                "indélébile que possible.\n\n"
                "Seules les exceptions suivantes aux stipulations ci-dessus seront "
                "permises, selon les conditions et règles à déterminer par "
                "l'Administration douanière :\n"
                "a) les articles reçus en douane pour réexportation ou en transit "
                "dans un pays extérieur ;\n"
                "b) articles non destinés à être vendus ou à être autrement "
                "transférés, de valeur minime ou pour l'usage personnel de "
                "l'importateur ;\n"
                "c) substances et produits crus et leurs contenants ;\n"
                "d) marchandises en vrac, dont le pays d'origine pourra être "
                "déterminé d'après les documents. »\n\n"
                "Article 2.— Le délai pour l'application de l'arrêté du 22 Mai 1935 "
                "est prolongé jusqu'au 27 Mai 1936, date à laquelle le présent "
                "arrêté entrera en vigueur.\n"
                "Article 3.— Le présent arrêté sera publié et exécuté à la diligence "
                "du Secrétaire d'État des Finances et du Commerce.\n\n"
                "Donné au Palais National, à Port-au-Prince, le 7 Mai 1936.\n"
                "STENIO VINCENT — Par le Président : Le Secrétaire d'État des "
                "Finances et du Commerce : MONT-ROSIER DEJEAN."
            ),
        ),
        EntryData(
            position=3,
            detected_category="arrete",
            display_title=(
                "Arrêté approuvant la liquidation des pensions de Mesdames "
                "Emogène Lefèvre et Honoré dite Grandisson Moïse"
            ),
            detected_title="Arrêté du 5 mai 1936",
            detected_number=None,
            detected_date=date(1936, 5, 5),
            summary_fr=(
                "Approbation de la liquidation des pensions des anciennes "
                "directrices d'école Emogène Lefèvre (École de filles d'Émery, "
                "Gdes 60.00) et Honoré dite Grandisson Moïse (École de filles de "
                "Quartier-Morin, Gdes 60.00), inscrites au Grand Livre des "
                "pensions."
            ),
            page_from=2,
            page_to=2,
            raw_text=(
                "STENIO VINCENT, PRÉSIDENT DE LA RÉPUBLIQUE.\n\n"
                "Vu les Articles 15 et 26 de la loi du 5 Février 1923 ;\n"
                "Sur le rapport du Secrétaire d'État des Finances ;\n"
                "Et de l'avis du Conseil des Secrétaires d'État ;\n\n"
                "Arrête :\n"
                "Article 1er.— Est approuvée la liquidation des pensions ci-après "
                "désignées, s'élevant à la somme de cent gourdes (Gdes. 100.00) :\n"
                "1°) Madame Emogène Lefèvre, ancienne directrice de l'école de "
                "filles d'Émery — Gdes 60.00 ;\n"
                "2°) Madame Vve Honoré dite Grandisson Moïse, ancienne directrice "
                "de l'école de filles de Quartier-Morin — Gdes 60.00.\n\n"
                "Article 2.— Ces pensions seront inscrites dans le Grand Livre des "
                "pensions tenu à la Secrétairerie d'État des Finances, pour extrait "
                "en être délivré aux pensionnaires, conformément aux dispositions "
                "de la loi en la matière.\n"
                "Article 3.— Le présent Arrêté sera publié et exécuté à la "
                "diligence du Secrétaire d'État des Finances.\n\n"
                "Donné au Palais National, à Port-au-Prince, le 5 Mai 1936, An "
                "133ème de l'Indépendance, et an 2ème de la Libération du "
                "Territoire Haïtien et de la Restauration des Droits du Peuple "
                "Haïtien.\n"
                "STENIO VINCENT — Par le Président : Le Secrétaire d'État des "
                "Finances : MONT-ROSIER DEJEAN."
            ),
        ),
    ],
)

# ──────────────────────────────────────────────────────────────────────
# Moniteur N° 53 (Numéro Extraordinaire) — Mercredi 7 juin 2006 —
# 161ème Année.  Director: Willems Edouard.
# Single major act: décret fixant les principes fondamentaux de
# gestion des emplois de la Fonction Publique Territoriale.
# ──────────────────────────────────────────────────────────────────────
ISSUE_2006_53 = IssueData(
    number="53",
    year=2006,
    publication_date=date(2006, 6, 7),
    edition_label="Numéro Extraordinaire",
    director="Willems Edouard",
    director_role="Directeur Général",
    file_url="data/scans/moniteur-2006-53.pdf",
    page_count=32,
    entries=[
        EntryData(
            position=0,
            detected_category="decret",
            display_title=(
                "Décret fixant les principes fondamentaux de gestion des emplois "
                "de la Fonction Publique Territoriale et de ses Établissements "
                "Publics"
            ),
            detected_title="Décret du 7 juin 2006",
            detected_number=None,
            detected_date=date(2006, 6, 7),
            summary_fr=(
                "Texte fondateur de la Fonction Publique Territoriale haïtienne. "
                "Pose le cadre normatif des emplois permanents et contractuels "
                "dans les Sections Communales, Communes et Départements, organise "
                "le Conseil Supérieur de la Fonction Publique Territoriale et "
                "l'Institut National de l'Administration Territoriale (INAT), "
                "définit les cinq catégories A-E d'emplois et leur classement "
                "hiérarchique. Pris par le Président Provisoire Me. Boniface "
                "Alexandre sur le rapport du Ministre de l'Intérieur."
            ),
            page_from=1,
            page_to=32,
            raw_text=(
                "Me. BONIFACE ALEXANDRE, PRÉSIDENT PROVISOIRE DE LA RÉPUBLIQUE.\n\n"
                "Vu les Articles 9, 9-1, 31-1, 32-2, 32-4, 32-7, 32-9, 35-1, 36-1, "
                "48, 61, 61-1, 62, 63, 63-1, 64, 65, 66, 67, 68, 69, 70, 71, 72, "
                "73, 74, 86, 175, 200, 200-1, 200-4, 207, 209, 217, 218, 220, 223, "
                "227-4, 234, 235, 236, 236-1, 236-2, 238 de la Constitution ;\n"
                "Vu l'entente convenue entre la Communauté Internationale, les "
                "Organisations de la Société Civile et les Partis Politiques "
                "portant création de la Commission Tripartite et du Conseil des "
                "Sages ;\n"
                "Vu le Consensus de Transition Politique adopté le 4 avril 2004 ;\n"
                "Vu la Loi du 18 septembre 1978 sur les délimitations "
                "territoriales ;\n"
                "Vu la Loi du 19 septembre 1982 relative à l'adoption d'une "
                "politique cohérente d'aménagement du territoire et de "
                "développement à partir des entités régionales issues du "
                "regroupement des Départements géographiques et des "
                "Arrondissements de la République ;\n"
                "Vu la Loi du 29 novembre 1994 portant création, organisation et "
                "fonctionnement de la Police Nationale d'Haïti ;\n"
                "Vu la Loi du 4 avril 1996 portant organisation de la Collectivité "
                "Territoriale de la Section Communale ;\n"
                "Vu la Loi du 18 juillet 1996 créant un Fonds de Gestion et de "
                "Développement des Collectivités Territoriales ;\n"
                "Vu le Décret-Loi du 22 octobre 1982 sur les Communes ;\n"
                "Vu le Décret du 4 novembre 1983 portant organisation et "
                "fonctionnement de la Cour Supérieure des Comptes et du "
                "Contentieux Administratif (CSCCA) ;\n"
                "Vu le Décret du 25 janvier 1985 créant la Direction Générale des "
                "Impôts (DGI) ; Vu le Décret du 11 septembre 1985 sur le Budget et "
                "la Comptabilité Publique ; Vu le Décret du 13 mars 1987 portant "
                "réorganisation du Ministère de l'Économie et des Finances ; Vu le "
                "Décret du 28 septembre 1987 sur la Patente ; Vu le Décret du 15 "
                "janvier 1988 portant sur les recettes des Collectivités "
                "Territoriales ; Vu le Décret du 31 mai 1990 portant organisation "
                "et fonctionnement du Ministère de l'Intérieur ; Vu le Décret du "
                "16 février 2005 sur la Préparation et l'Exécution des Lois de "
                "Finances ; Vu l'Arrêté du 16 février 2005 portant Règlement de la "
                "Comptabilité Publique ; Vu le Décret du 3 décembre 2004 fixant la "
                "réglementation des Marchés Publics de Services, de Fournitures et "
                "de Travaux ; Vu le Décret du 17 mai 2005 sur l'Administration "
                "d'État ; Vu le Décret de janvier 2006 définissant le cadre "
                "général de la décentralisation, les principes de fonctionnement "
                "et d'organisation des Collectivités Territoriales haïtiennes ;\n\n"
                "Considérant que la Constitution de 1987 prône une "
                "décentralisation qui implique la mise en place d'une "
                "administration au niveau des collectivités territoriales ; "
                "Considérant que, pour garantir la réussite de cette "
                "décentralisation effective, il y a lieu de doter les "
                "collectivités de ressources humaines permettant une gestion "
                "efficace et efficiente de l'administration locale ; Considérant "
                "qu'il y a lieu d'instaurer le principe de la continuité dans la "
                "gestion des collectivités en créant une fonction publique "
                "territoriale permanente ; Considérant que pour ce faire, il est "
                "nécessaire d'avoir des fonctionnaires de carrière appelés à "
                "résister aux aléas de l'allégeance politique ; Considérant qu'il "
                "y convient de mettre en place le cadre normatif réglementant "
                "l'organisation de cette fonction territoriale et qu'il y a lieu "
                "de fixer les principes d'équité et de rationalité nécessaires à "
                "la protection de ladite carrière ; Considérant que le pouvoir "
                "législatif est pour le moment inopérant qu'il y a alors lieu "
                "pour le Pouvoir Exécutif de légiférer par Décret sur les objets "
                "d'intérêt public ;\n\n"
                "Sur le rapport du Ministre de l'Intérieur ; Et après "
                "délibération en Conseil des Ministres ;\n\n"
                "DÉCRÈTE\n\n"
                "Article 1.— Les dispositions du présent Décret fixent les "
                "principes fondamentaux de gestion des emplois de la fonction "
                "publique territoriale et de ses établissements publics.\n\n"
                "TITRE I — DISPOSITIONS GÉNÉRALES\n"
                "Article 2.— Les dispositions du présent Décret s'appliquent aux "
                "personnes qui ont été ou sont nommées dans un emploi permanent "
                "et titularisées dans un grade de la hiérarchie administrative "
                "des Sections Communales, des Communes, des Départements à "
                "l'exception des caissiers payeurs.\n"
                "Article 3.— Les collectivités mentionnées à l'article 2 ne "
                "peuvent recruter des agents non titulaires que pour assurer le "
                "remplacement momentané de titulaires autorisés à exercer leurs "
                "fonctions à temps partiel ou de titulaires indisponibles en "
                "raison d'un congé de maladie, d'un congé de maternité ou d'un "
                "congé parental ou encore pour faire face temporairement, pour "
                "une durée maximale d'un an, à la vacance d'un emploi qui ne "
                "peut être immédiatement pourvu dans les conditions prévues par "
                "le présent Décret. Ces collectivités peuvent, par contre, "
                "recruter des agents non titulaires pour exercer des fonctions "
                "correspondant à un besoin saisonnier, pour une durée maximale "
                "de six mois pendant une même période de douze mois et conclure, "
                "pour une durée maximale de trois mois, renouvelable une seule "
                "fois à titre exceptionnel, des contrats pour faire face à un "
                "besoin occasionnel.\n"
                "Article 4.— Par dérogation au principe énoncé au présent Décret, "
                "des emplois permanents peuvent être occupés par des agents "
                "contractuels lorsqu'il n'existe pas de fonctionnaires "
                "susceptibles d'assurer certaines fonctions spécialisées ou "
                "lorsque les besoins des services le justifient. Les agents "
                "recrutés au titre du présent article sont engagés par des "
                "contrats à durée déterminée ne dépassant pas un an. Ces "
                "contrats sont renouvelables, par reconduction expresse. La "
                "durée des contrats successifs ne peut excéder quatre ans. Si, à "
                "l'issue de la période maximale de quatre ans mentionnée à "
                "l'alinéa précédent, ces contrats sont reconduits, ils ne "
                "peuvent l'être que par décision expresse et pour une durée "
                "indéterminée.\n"
                "Article 5.— Les fonctionnaires territoriaux appartiennent à des "
                "cadres ou corps d'emplois communs aux sections communales, aux "
                "communes et aux départements. Un cadre d'emplois regroupe les "
                "fonctionnaires soumis au même statut particulier, titulaires "
                "d'un grade leur donnant accès à un ensemble d'emplois. Chaque "
                "titulaire d'un grade a le droit d'occuper les emplois "
                "correspondant à ce grade. Le cadre ou corps d'emplois peut "
                "regrouper plusieurs grades. Les grades sont organisés en "
                "grades initiaux et en grades d'avancement. L'accès aux grades "
                "dans chaque cadre d'emplois s'effectue par voie de concours, "
                "de promotion interne ou d'avancement, dans les conditions "
                "fixées par les statuts particuliers.\n"
                "Article 6.— Les cadres d'emplois sont répartis en cinq "
                "catégories désignées dans l'ordre hiérarchique décroissant "
                "par les lettres A, B, C, D et E. L'appartenance des "
                "fonctionnaires à une catégorie d'emploi dépend de leur niveau "
                "de qualification et de recrutement.\n\n"
                "[Le texte intégral du décret occupe les 32 pages du Moniteur — "
                "TITRE II « Dispositions relatives à l'organisation de la "
                "Fonction Publique Territoriale » (Conseil Supérieur, INAT, "
                "Centres de gestion départementaux), TITRE III « Recrutement et "
                "carrière », TITRE IV « Régime disciplinaire et cessation "
                "définitive de fonctions », TITRE V « Dispositions transitoires "
                "et finales ». Cf. le PDF source pour le détail des articles 7 "
                "à 124 — la transcription complète est éditoriale.]"
            ),
        ),
    ],
)


# ──────────────────────────────────────────────────────────────────────
# Moniteur N° 102 — Vendredi 12 juin 2020 — 175ème Année
# Director: Ronald Saint Jean
# ──────────────────────────────────────────────────────────────────────
ISSUE_2020_102 = IssueData(
    number="102",
    year=2020,
    publication_date=date(2020, 6, 12),
    edition_label=None,
    director="Ronald Saint Jean",
    director_role="Directeur Général",
    file_url="data/scans/moniteur-2020-102.pdf",
    page_count=4,
    entries=[
        EntryData(
            position=0,
            detected_category="arrete",
            display_title=(
                "Arrêté sanctionnant, pour sortir son plein et entier effet, le "
                "Document de Politique Nationale de Protection et de Promotion "
                "Sociales (PNPPS)"
            ),
            detected_title="Arrêté du 5 juin 2020",
            detected_number=None,
            detected_date=date(2020, 6, 5),
            summary_fr=(
                "Sanction officielle du document de Politique Nationale de "
                "Protection et de Promotion Sociales (PNPPS), pris en Conseil "
                "des Ministres sur le rapport de la Ministre des Affaires "
                "Sociales et du Travail. Outil de référence pour briser la "
                "reproduction intergénérationnelle de la pauvreté."
            ),
            page_from=1,
            page_to=4,
            raw_text=(
                "JOVENEL MOÏSE, PRÉSIDENT.\n\n"
                "Vu la Constitution, notamment ses articles 19, 22, 23, 136 et "
                "156 ; Vu le Décret du 4 novembre 1983 organisant le Ministère "
                "des Affaires Sociales ; Vu le Décret du 17 mai 2005 portant "
                "organisation de l'Administration centrale de l'État ; Vu le "
                "Décret du 17 novembre 2005 portant organisation et "
                "fonctionnement du Ministère de la Santé Publique et de la "
                "Population (MSPP) ;\n\n"
                "Considérant qu'il est impératif pour l'État de définir les "
                "grandes orientations en matière de protection et de promotion "
                "sociales afin de casser la reproduction intergénérationnelle "
                "de la pauvreté et créer de meilleures conditions de vie pour "
                "la population ;\n"
                "Considérant qu'à cet effet, un document de Politique Nationale "
                "de Promotion et de Protection Sociales (PNPPS) a été élaboré "
                "et constitue un outil essentiel de référence de protection et "
                "de promotion sociales ;\n"
                "Considérant qu'il y a lieu de sanctionner, pour sortir son "
                "plein et entier effet, le document de Politique Nationale de "
                "Promotion et de Protection Sociales (PNPPS) ;\n"
                "Sur le rapport de la Ministre des Affaires Sociales et du "
                "Travail ; Et après délibération en Conseil des Ministres ;\n\n"
                "ARRÊTE\n\n"
                "Article 1er.— Est et demeure sanctionné, pour sortir son plein "
                "et entier effet, le document de Politique Nationale de "
                "Protection et de Promotion Sociales (PNPPS).\n"
                "Article 2.— Le présent arrêté sera imprimé, publié et exécuté "
                "à la diligence du Ministre des Affaires Sociales et du "
                "Travail.\n\n"
                "Donné au Palais National, à Port-au-Prince, le 5 juin 2020, An "
                "217e de l'Indépendance.\n\n"
                "Par : Le Président Jovenel MOÏSE — Le Premier Ministre Joseph "
                "JOUTHE — Le Ministre de la Planification et de la Coopération "
                "Externe Joseph JOUTHE — Le Ministre des Affaires Étrangères et "
                "des Cultes Claude JOSEPH — Le Ministre de la Défense Jean "
                "Walnard DORNEVAL — Le Ministre de l'Économie et des Finances "
                "Michel Patrick BOISVERT — Le Ministre de l'Agriculture, des "
                "Ressources Naturelles et du Développement Rural Patrix SEVERE "
                "— Le Ministre des Travaux Publics, Transports et "
                "Communications Nader JOISEUS — Le Ministre du Commerce et de "
                "l'Industrie Jonas COFFY — Le Ministre de l'Environnement Abner "
                "SEPTEMBRE — La Ministre du Tourisme Myriam JEAN — Le Ministre "
                "de la Justice et de la Sécurité Publique Lucmanne DELILLE — "
                "Le Ministre des Haïtiens vivant à l'Étranger Louis Gonzague "
                "Edner DAY — Le Ministre de l'Intérieur et des Collectivités "
                "Territoriales Audain Fils BERNADEL — Le Ministre de "
                "l'Éducation Nationale et de la Formation Professionnelle "
                "Pierre Josué Agénor CADET — La Ministre des Affaires Sociales "
                "et du Travail Nicole Yolette ALTIDOR — La Ministre de la "
                "Santé Publique et de la Population Marie Gréta ROY CLÉMENT — "
                "La Ministre à la Condition Féminine et aux Droits des Femmes "
                "Marie Giselhaine MOMPREMIER — Le Ministre de la Jeunesse, des "
                "Sports et de l'Action Civique Max ATTYS — Le Ministre de la "
                "Culture et de la Communication Pradel HENRIQUEZ."
            ),
        ),
    ],
)

# ──────────────────────────────────────────────────────────────────────
# Moniteur Spécial N° 57 — Lundi 11 novembre 2024 — 179ème Année
# Director: Ronald Saint Jean
# Two entries: Résolution + Arrêté.
# ──────────────────────────────────────────────────────────────────────
ISSUE_2024_SPECIAL_57 = IssueData(
    number="Spécial 57",
    year=2024,
    publication_date=date(2024, 11, 11),
    edition_label="Numéro Spécial",
    director="Ronald Saint Jean",
    director_role="Directeur Général",
    file_url="data/scans/moniteur-2024-special-57.pdf",
    page_count=4,
    entries=[
        EntryData(
            position=0,
            detected_category="resolution",
            display_title=(
                "Résolution faisant choix, par consensus, du citoyen Alix Didier "
                "Fils-Aimé comme Premier Ministre"
            ),
            detected_title="Résolution du 8 novembre 2024",
            detected_number=None,
            detected_date=date(2024, 11, 8),
            summary_fr=(
                "Résolution du Conseil Présidentiel de Transition (CPT) réuni au "
                "Palais National choisissant par consensus le citoyen Alix Didier "
                "Fils-Aimé comme Premier Ministre."
            ),
            page_from=1,
            page_to=2,
            raw_text=(
                "LE CONSEIL PRÉSIDENTIEL DE TRANSITION — RÉSOLUTION FAISANT CHOIX, "
                "PAR CONSENSUS, DU CITOYEN ALIX DIDIER FILS-AIMÉ COMME PREMIER "
                "MINISTRE.\n\n"
                "Nous, Smith AUGUSTIN, Louis Gérald GILLES, Fritz Alphonse JEAN, "
                "Edgard LEBLANC Fils, Laurent SAINT-CYR, Emmanuel VERTILAIRE, "
                "Leslie VOLTAIRE, membres votants, Régine ABRAHAM et Frinel "
                "JOSEPH, membres observateurs sans droit de vote du Conseil "
                "Présidentiel de Transition (CPT), réunis ce vendredi 8 novembre "
                "2024, au Palais National, avons fait choix, par consensus, du "
                "citoyen Alix Didier FILS-AIMÉ comme Premier Ministre.\n\n"
                "La présente Résolution sera publiée et exécutée aux fins de "
                "droit.\n\n"
                "Donné au Palais National, à Port-au-Prince, le 8 novembre 2024, "
                "An 221e de l'Indépendance.\n\n"
                "Par Le Conseil Présidentiel de Transition : La Conseillère-"
                "Présidente Régine ABRAHAM ; Le Conseiller-Président Smith "
                "AUGUSTIN ; Le Conseiller-Président Louis Gérald GILLES ; Le "
                "Conseiller-Président Fritz Alphonse JEAN ; Le Conseiller-"
                "Président Frinel JOSEPH ; Le Conseiller-Président Edgard LEBLANC "
                "Fils ; Le Conseiller-Président Laurent SAINT-CYR ; Le "
                "Conseiller-Président Emmanuel VERTILAIRE ; Le Conseiller-"
                "Président Leslie VOLTAIRE."
            ),
        ),
        EntryData(
            position=1,
            detected_category="arrete",
            parent_position=0,
            display_title="Arrêté nommant le citoyen Alix Didier Fils-Aimé Premier Ministre",
            detected_title="Arrêté du 8 novembre 2024",
            detected_number=None,
            detected_date=date(2024, 11, 8),
            summary_fr=(
                "Arrêté du Conseil Présidentiel de Transition nommant Alix Didier "
                "Fils-Aimé Premier Ministre, conformément à la résolution prise "
                "par consensus le 8 novembre 2024."
            ),
            page_from=2,
            page_to=3,
            raw_text=(
                "LE CONSEIL PRÉSIDENTIEL DE TRANSITION — ARRÊTÉ NOMMANT LE "
                "CITOYEN ALIX DIDIER FILS-AIMÉ PREMIER MINISTRE.\n\n"
                "Vu la Constitution de la République ; Vu le Décret du 17 mai 2005 "
                "portant organisation de l'Administration centrale de l'État ; Vu "
                "le Décret du 17 mai 2005 portant révision du Statut général de la "
                "Fonction publique ; Vu le Décret du 10 avril 2024 portant "
                "création du Conseil Présidentiel de Transition ; Vu le Décret du "
                "23 mai 2024 déterminant l'organisation et le mode de "
                "fonctionnement du Conseil Présidentiel de Transition ; Vu "
                "l'Arrêté du 16 avril 2024 nommant les membres du Conseil "
                "Présidentiel de Transition ;\n\n"
                "Considérant que, par résolution en date du 8 novembre 2024, Le "
                "Conseil Présidentiel de Transition a fait choix, par consensus, "
                "du citoyen Alix Didier Fils-Aimé comme Premier Ministre ; "
                "Considérant qu'il y a lieu de nommer le Premier Ministre ;\n\n"
                "ARRÊTE\n\n"
                "Article 1er.— Le citoyen Alix Didier FILS-AIMÉ est nommé Premier "
                "Ministre.\n"
                "Article 2.— Une ampliation du présent Arrêté sera remise à "
                "l'intéressé.\n"
                "Article 3.— Le présent Arrêté sera publié et exécuté aux fins de "
                "droit.\n\n"
                "Donné au Palais National, à Port-au-Prince, le 8 novembre 2024, "
                "An 221e de l'Indépendance.\n\n"
                "Par Le Conseil Présidentiel de Transition : La Conseillère-"
                "Présidente Régine ABRAHAM ; les Conseillers-Présidents Smith "
                "AUGUSTIN, Louis Gérald GILLES, Fritz Alphonse JEAN, Frinel "
                "JOSEPH, Edgard LEBLANC Fils, Laurent SAINT-CYR, Emmanuel "
                "VERTILAIRE, Leslie VOLTAIRE."
            ),
        ),
    ],
)

# ──────────────────────────────────────────────────────────────────────
# Moniteur Spécial N° 51 — Mardi 12 août 2025 — 180ème Année
# Director: Ronald Saint Jean
# ──────────────────────────────────────────────────────────────────────
ISSUE_2025_SPECIAL_51 = IssueData(
    number="Spécial 51",
    year=2025,
    publication_date=date(2025, 8, 12),
    edition_label="Numéro Spécial",
    director="Ronald Saint Jean",
    director_role="Directeur Général",
    file_url="data/scans/moniteur-2025-special-51.pdf",
    page_count=4,
    entries=[
        EntryData(
            position=0,
            detected_category="decret",
            display_title=(
                "Décret instaurant l'état d'urgence sur les Départements de "
                "l'Ouest, de l'Artibonite et du Centre pour trois (3) mois"
            ),
            detected_title="Décret du 8 août 2025",
            detected_number=None,
            detected_date=date(2025, 8, 8),
            summary_fr=(
                "Instauration de l'état d'urgence sur les Départements de "
                "l'Ouest, de l'Artibonite et du Centre pour la période du 9 "
                "août au 9 novembre 2025. Habilite le Gouvernement à prendre "
                "vingt-trois (23) mesures pour le rétablissement de l'ordre "
                "public face à la violence des gangs armés et à la situation "
                "humanitaire catastrophique. Pris par le Conseil Présidentiel "
                "de Transition (Régine Abraham, Smith Augustin, Louis Gérald "
                "Gilles, Fritz Alphonse Jean, Frinel Joseph, Edgard Leblanc "
                "Fils, Laurent Saint-Cyr, Emmanuel Vertilaire, Leslie "
                "Voltaire) en raison de l'inopérance du Pouvoir Législatif."
            ),
            page_from=1,
            page_to=4,
            raw_text=(
                "LE CONSEIL PRÉSIDENTIEL DE TRANSITION — DÉCRET INSTAURANT "
                "L'ÉTAT D'URGENCE SUR LES DÉPARTEMENTS DE L'OUEST, DE "
                "L'ARTIBONITE ET DU CENTRE POUR TROIS (3) MOIS.\n\n"
                "Vu la Constitution de la République ; Vu le Décret du 15 "
                "mars 2021 révisant la Loi du 15 avril 2010 portant "
                "amendement de celle du 9 septembre 2008 sur l'état "
                "d'urgence ; Vu le Décret du 10 avril 2024 portant création "
                "du Conseil Présidentiel de Transition ; Vu le Décret du 23 "
                "mai 2024 déterminant l'organisation et le mode de "
                "fonctionnement du Conseil Présidentiel de Transition ;\n\n"
                "Considérant que la crise multiforme que connaît le pays "
                "entraîne une situation d'extrême urgence caractérisée "
                "notamment par une violence accrue des gangs armés et une "
                "situation humanitaire préoccupante menaçant l'existence de "
                "la population et les fondements de la République ; "
                "Considérant que les actions criminelles des bandes armées, "
                "suivies de menace de guerre civile et de génocide, par "
                "leur ampleur et leur ignominie, revêtent un caractère "
                "hautement dangereux pour la sécurité nationale, "
                "subrégionale, régionale et internationale ; Considérant "
                "que la situation sécuritaire a des incidences négatives "
                "graves sur les secteurs productifs, notamment sur les "
                "produits agricoles et alimentaires, les services et sur la "
                "mobilité des personnes et des biens ; Considérant que, "
                "pour mettre fin à cette dégradation sécuritaire et "
                "humanitaire catastrophique pour le pays, il est urgent "
                "d'instaurer l'état d'urgence sur les Départements de "
                "l'Ouest, de l'Artibonite et du Centre ; Considérant qu'aux "
                "termes du Décret du 15 mars 2021 susvisé, l'état d'urgence "
                "déclaré par les autorités centrales, par Arrêté, vaut pour "
                "une période maximale d'un (1) mois à l'expiration de "
                "laquelle il peut être renouvelé pour une autre période "
                "d'un (1) mois et, au-delà de deux (2) mois, l'état "
                "d'urgence peut être renouvelé avec l'assentiment du Corps "
                "Législatif pour une autre période déterminée en fonction "
                "de l'ampleur de la situation ; Considérant que l'ampleur "
                "de la situation sécuritaire et humanitaire est telle qu'il "
                "est impérieux de décréter une grande mobilisation des "
                "ressources et des moyens institutionnels de l'État pendant "
                "une période de trois (3) mois consécutifs ; Considérant "
                "que le Pouvoir Législatif est, pour le moment, inopérant "
                "et qu'il y a alors lieu, pour le Pouvoir Exécutif, de "
                "prendre un Décret pour instaurer l'état d'urgence sur les "
                "Départements de l'Ouest, de l'Artibonite et du Centre "
                "pour trois (3) mois ;\n\n"
                "Sur le rapport des Ministres de la Justice et de la "
                "Sécurité Publique, de l'Intérieur et des Collectivités "
                "Territoriales, de la Défense, de l'Agriculture, des "
                "Ressources Naturelles et du Développement Rural, de "
                "l'Économie et des Finances, de la Planification et de la "
                "Coopération Externe, du Commerce et de l'Industrie, et de "
                "la Santé Publique et de la Population ; Et après "
                "délibération en Conseil des Ministres ;\n\n"
                "DÉCRÈTE\n\n"
                "Article 1er.— L'état d'urgence est instauré sur les "
                "Départements de l'Ouest, de l'Artibonite et du Centre pour "
                "trois (3) mois, allant du 9 août au 9 novembre 2025.\n\n"
                "Article 2.— En vertu du présent Décret, le Gouvernement "
                "est habilité à prendre les mesures suivantes pour le "
                "rétablissement du cours normal de la vie :\n"
                " 1° ordonner la mise en œuvre des mesures prévues par le "
                "plan d'intervention visant à rétablir l'ordre public, la "
                "paix sociale et la sécurité sur toute l'étendue des "
                "Départements mentionnés à l'article 1er ;\n"
                " 2° appliquer des procédures célères de déblocage de "
                "fonds ;\n"
                " 3° faire les dépenses jugées nécessaires ;\n"
                " 4° désaffecter des crédits budgétaires en vue de faire "
                "face à la situation, à l'exception des salaires, "
                "indemnités et pensions de retraite ;\n"
                " 5° passer les contrats qu'il juge nécessaires selon les "
                "procédures célères prévues par la réglementation sur les "
                "marchés publics ;\n"
                " 6° accorder, pour le temps qu'il juge nécessaire à "
                "l'exécution rapide et efficace des mesures d'intervention, "
                "les autorisations ou dérogations prévues par la Loi pour "
                "l'exercice d'une activité ou l'accomplissement d'un acte "
                "requis dans les circonstances ;\n"
                " 7° ordonner, le cas échéant, la fermeture "
                "d'établissements ;\n"
                " 8° ordonner, lorsqu'il n'y a pas d'autre moyen de "
                "protection, l'évacuation des personnes ;\n"
                " 9° prendre les dispositions nécessaires en vue d'héberger "
                "les populations déplacées et pourvoir, au besoin, à leur "
                "ravitaillement ;\n"
                "10° contrôler l'accès aux voies de circulation sur toute "
                "l'étendue des Départements mentionnés à l'article 1er ou "
                "le soumettre à des règles particulières ;\n"
                "11° mettre en œuvre tout programme d'assistance "
                "financière jugé nécessaire à l'égard des personnes "
                "victimes ;\n"
                "12° ordonner, lorsqu'il n'y a pas d'autre moyen de "
                "protection, la construction ou la démolition d'ouvrages "
                "ainsi que le déplacement de tout bien public ou privé ;\n"
                "13° mettre des agents publics à disposition des "
                "institutions responsables de la protection civile ;\n"
                "14° requérir l'aide de toute personne en mesure de venir "
                "en appui aux effectifs déployés, si le nombre des agents "
                "publics disponibles ne suffit pas ;\n"
                "15° coordonner le recrutement et l'action des bénévoles ;\n"
                "16° réquisitionner des moyens supplémentaires de secours "
                "et lieux d'hébergement appartenant à des personnes "
                "privées, si les moyens logistiques dont disposent les "
                "services publics ne suffisent pas ;\n"
                "17° créer et organiser toute structure ad hoc dotée de "
                "pouvoirs nécessaires pour assurer la gestion équitable de "
                "la situation d'urgence ;\n"
                "18° renforcer les dispositifs de sécurité sur toute "
                "l'étendue des Départements mentionnés à l'article 1er ;\n"
                "19° faire diffuser, par les stations émettrices, des "
                "émissions visant à informer valablement la population, "
                "notamment sur les comportements à avoir pendant la période "
                "d'état d'urgence ;\n"
                "20° engager les Forces Armées d'Haïti en vue de prêter "
                "main forte à la Police Nationale d'Haïti ;\n"
                "21° instaurer des mesures de sûreté spéciales sur toute "
                "l'étendue des Départements mentionnés à l'article 1er ;\n"
                "22° ordonner, le cas échéant, la suspension de certains "
                "services essentiels comme la communication routière, "
                "maritime, aérienne et téléphonique, pour les besoins des "
                "opérations ; et\n"
                "23° mobiliser des ressources supplémentaires tant "
                "nationales qu'internationales aux fins d'amélioration des "
                "conditions de sécurité physique des citoyens et de "
                "sécurité alimentaire et agricole du pays.\n\n"
                "Article 3.— Le présent Décret sera publié et exécuté à la "
                "diligence des Ministres de la Justice et de la Sécurité "
                "Publique, de l'Intérieur et des Collectivités "
                "Territoriales, de la Défense, de l'Agriculture, des "
                "Ressources Naturelles et du Développement Rural, de "
                "l'Économie et des Finances, de la Planification et de la "
                "Coopération Externe, du Commerce et de l'Industrie, et de "
                "la Santé Publique et de la Population, chacun en ce qui "
                "le concerne.\n\n"
                "Donné au Palais National, à Port-au-Prince, le 8 août "
                "2025, An 222e de l'Indépendance.\n\n"
                "Par le Conseil Présidentiel de Transition. Pour le "
                "Conseil : Le Conseiller-Président Laurent SAINT-CYR. "
                "Signé : Le Premier Ministre Alix Didier FILS-AIMÉ ; le "
                "Ministre de l'Intérieur et des Collectivités "
                "Territoriales Paul Antoine BIEN-AIME ; le Ministre de la "
                "Justice et de la Sécurité Publique Patrick PÉLISSIER ; "
                "le Ministre des Affaires Étrangères et des Cultes "
                "Jean-Victor Harvel JEAN-BAPTISTE ; la Ministre des "
                "Haïtiens vivant à l'étranger J. E. Kathia VERDIER ; le "
                "Ministre de l'Économie et des Finances Alfred Fils "
                "METELLUS ; la Ministre de la Planification et de la "
                "Coopération Externe Marie D. A. Ketleen FLORESTAL ; le "
                "Ministre de l'Agriculture, des Ressources Naturelles et "
                "du Développement Rural Vernet JOSEPH ; le Ministre des "
                "Travaux Publics, Transports et Communications Raphaël "
                "HOSTY ; le Ministre du Commerce et de l'Industrie James "
                "MONAZARD ; le Ministre du Tourisme John Herrick "
                "DESSOURCES ; le Ministre de l'Environnement Moïse "
                "JEAN-PIERRE Fils ; le Ministre de l'Éducation Nationale "
                "et de la Formation Professionnelle Augustin ANTOINE ; le "
                "Ministre de la Culture et de la Communication Patrick "
                "DELATOUR ; le Ministre des Affaires Sociales et du "
                "Travail Georges Wilbert FRANCK ; le Ministre de la Santé "
                "Publique et de la Population Bertrand SINAL ; la "
                "Ministre de la Condition Féminine et des Droits de la "
                "Femme Pédrica SAINT-JEAN ; la Ministre de la Jeunesse, "
                "des Sports et de l'Action Civique Niola Lynn Sarah "
                "DEVALIS OCTAVIUS ; le Ministre de la Défense Jean Michel "
                "MOÏSE."
            ),
        ),
    ],
)

ALL_ISSUES: list[IssueData] = [
    ISSUE_1936_40,
    ISSUE_2006_53,
    ISSUE_2020_102,
    ISSUE_2024_SPECIAL_57,
    ISSUE_2025_SPECIAL_51,
]
