# Laws-folder survey

- Source: `/Users/pracht/Downloads/laws`
- Probed: first 2 pages of each PDF (text layer + OCR fallback)
- Total files: **36**
- NEW (likely missing from DB): **32**
- Folder-internal duplicates (byte-identical): **4**
- DB duplicates (heuristic title/date match): **0**
- Match an existing Moniteur issue: **0**

Doc-type + date are guessed from the filename first, then the
cover-page header — body text is full of citations (``Vu la
Loi du …``) and will bait the detector. Cryptic filenames
like ``54785cac4.pdf`` get a best-effort body-text guess.

| File | Size | Doc-type | Date | Title guess | Status | Match reason |
|---|---:|---|---|---|---|---|
| `03-18-1966-A.pdf` | 308 KB | loi | 1958-03-12 | 03 18 1966 A | **NEW** | no match |
| `1005901609-5f5a8ad385746801097332.pdf` | 1184 KB | arrêté | — | 5f5a8ad385746801097332 | **NEW** | no match |
| `222345469-HAITI-Loi-relative-au-controle-et-a-la-repression-du-trafic-illicite-de-la-drogue-4-Octobre-2001.pdf` | 1797 KB | loi | 2001-10-04 | HAITI Loi relative au controle et a la repression du trafic illicite de la drogu | **NEW** | no match |
| `237115038-Decret-Fixant-l-Organisation-Et-Le-Fonctionnement-de-La-Commune (1).pdf` | 2201 KB | decret | 2006-06-02 | Decret Fixant l Organisation Et Le Fonctionnement de La Commune | **NEW** | no match |
| `237115038-Decret-Fixant-l-Organisation-Et-Le-Fonctionnement-de-La-Commune.pdf` | 2201 KB | decret | 2006-06-02 | Decret Fixant l Organisation Et Le Fonctionnement de La Commune | FOLDER-DUP of `237115038-Decret-Fixant-l-Organisation-Et-Le-Fonctionnement-de-La-Commune (1).pdf` | byte-identical to primary |
| `287728347-Haiti-L-Arrete-Presidentiel-193-Traitant-Des-Exonerations-Des-Anciens-Dignitaires-de-l-Etat.pdf` | 518 KB | arrete | 2015-10-08 | Haiti L Arrete Presidentiel 193 Traitant Des Exonerations Des Anciens Dignitaire | **NEW** | no match |
| `287784178-Le-Decret-du-23-Novembre-2005.pdf` | 401 KB | decret | 2005-11-23 | Le Decret du 23 Novembre 2005 | **NEW** | no match |
| `299581779-Decret-creant-le-Centre-financier-international-de-l-ile-de-La-Gonave.pdf` | 4755 KB | decret | 2016-01-07 | Decret creant le Centre financier international de l ile de La Gonave | **NEW** | no match |
| `392696061-Compilations-Textes-Relatifs-Aux-Fonds-Petrocaribe-Moniteur-Haiti.pdf` | 73715 KB | — | 2018-10-24 | Compilations Textes Relatifs Aux Fonds Petrocaribe Moniteur Haiti | **NEW** | no match |
| `526747291-ACCORD-POLITIQUE-POUR-UNE-GOUVERNANCE-APAISEE-ET-EFFICACE-DE-LA-PERIODE-INTERIMAIRE.pdf` | 6637 KB | accord | 2021-09-17 | ACCORD POLITIQUE POUR UNE GOUVERNANCE APAISEE ET EFFICACE DE LA PERIODE INTERIMA | **NEW** | no match |
| `530707552-Decret-du-17-aout-1987-portant-organisation-et-fonctionnement-du-Ministere-des-Affaires-Etrangeres-2.pdf` | 4188 KB | decret | 1987-08-17 | Decret du 17 aout 1987 portant organisation et fonctionnement du Ministere des A | **NEW** | no match |
| `542383239-Loi-signature-et-echanges-electroniques-2017 (1).pdf` | 7717 KB | loi | 2017-04-11 | Loi signature et echanges electroniques 2017 | **NEW** | no match |
| `542383239-Loi-signature-et-echanges-electroniques-2017.pdf` | 7717 KB | loi | 2017-04-11 | Loi signature et echanges electroniques 2017 | FOLDER-DUP of `542383239-Loi-signature-et-echanges-electroniques-2017 (1).pdf` | byte-identical to primary |
| `54785cac4.pdf` | 113 KB | accord | 2002-08-12 | 54785cac4 | **NEW** | no match |
| `548673623-Le-Moniteur-21-Mars-2014-ARRETE-FIXANT-LE-STATUT-PARTICULIER-DES-PERSONNELS-EDUCATIFS.pdf` | 5095 KB | arrete | 2014-03-21 | Le Moniteur 21 Mars 2014 ARRETE FIXANT LE STATUT PARTICULIER DES PERSONNELS EDUC | **NEW** | no match |
| `55535676-Reglements-Interieurs-du-Senat-Haiti.pdf` | 488 KB | reglement | 2009-08-12 | Reglements Interieurs du Senat Haiti | **NEW** | no match |
| `55540673-Les-Lois-Votees-Par-La-48eme-Legislature-Deputes-2006-2010 (1).pdf` | 203 KB | loi | 2006-01-01 | Les Lois Votees Par La 48eme Legislature Deputes 2006 2010 | **NEW** | no match |
| `558118993-DEcret-adaptant-les-structures-organlsattonnelles-du-MENJS-AUX-NOUVELLES-REALITES-POLITIQUES (1).pdf` | 1293 KB | decret | — | DEcret adaptant les structures organlsattonnelles du MENJS AUX NOUVELLES REALITE | **NEW** | no match |
| `558118993-DEcret-adaptant-les-structures-organlsattonnelles-du-MENJS-AUX-NOUVELLES-REALITES-POLITIQUES.pdf` | 1293 KB | decret | — | DEcret adaptant les structures organlsattonnelles du MENJS AUX NOUVELLES REALITE | FOLDER-DUP of `558118993-DEcret-adaptant-les-structures-organlsattonnelles-du-MENJS-AUX-NOUVELLES-REALITES-POLITIQUES (1).pdf` | byte-identical to primary |
| `57252819-Loi-portant-privileges-accordes-aux-Haitiens-d-origine-jouissant-d-une-autre-nationalite-et-a-leurs-descendants.pdf` | 65 KB | accord | 2002-08-12 | Loi portant privileges accordes aux Haitiens d origine jouissant d une autre nat | **NEW** | no match |
| `584826828-Decret-du-29-Mars-Reglementant-la-Profession-Avocat-pdf.pdf` | 160 KB | decret | 1979-03-29 | Decret du 29 Mars Reglementant la Profession Avocat pdf | **NEW** | no match |
| `603565368-Loi-Sur-Les-Partis-Politiques-Haiti-Haitijustice.pdf` | 205 KB | loi | 2014-01-16 | Loi Sur Les Partis Politiques Haiti Haitijustice | **NEW** | no match |
| `655172452-Loi-sur-les-Marche-s-Publics-10-Juin-2009.pdf` | 7671 KB | loi | 2009-06-10 | Loi sur les Marche s Publics 10 Juin 2009 | **NEW** | no match |
| `694424192-Moniteur-Bail-a-Usage-Professionnel-Decret-Du-9-Avril-2020.pdf` | 5503 KB | decret | 2020-04-09 | Moniteur Bail a Usage Professionnel Decret Du 9 Avril 2020 | **NEW** | no match |
| `700927831-Avis-de-Liquidation-de-Pension-Civile-de-Retraite.pdf` | 229 KB | avis | 2020-07-02 | Avis de Liquidation de Pension Civile de Retraite | **NEW** | no match |
| `701444946-Moniteur-Decret-7-Avril-1978-Creant-l-APN.pdf` | 994 KB | decret | 1978-04-07 | Moniteur Decret 7 Avril 1978 Creant l APN | **NEW** | no match |
| `701444950-Moniteur-Decret-15-Mars-1985-Organisant-l-APN.pdf` | 3287 KB | decret | 1985-03-15 | Moniteur Decret 15 Mars 1985 Organisant l APN | **NEW** | no match |
| `703232731-Loi-Moniteur-Decret-Loi-Organique-MENFP-1989.pdf` | 794 KB | decret | 1989-06-05 | Loi Moniteur Decret Loi Organique MENFP 1989 | **NEW** | no match |
| `832110484-Decret-Sections-Communales.pdf` | 4357 KB | decret | — | Decret Sections Communales | **NEW** | no match |
| `879756018-Decret-du-30-avril-2023.pdf` | 27894 KB | decret | 2023-04-30 | Decret du 30 avril 2023 | **NEW** | no match |
| `887716264-Regimes-Matrimoniaux-Decret-9-Avril-2020.pdf` | 9993 KB | decret | 2020-04-09 | Regimes Matrimoniaux Decret 9 Avril 2020 | **NEW** | no match |
| `914525166-Concordat-1860.docx` | 148 KB | concordat | 1860-01-01 | Concordat 1860 | **NEW** | no match |
| `968897041-Le-Decret-Electoral-Nov-2025.pdf` | 402 KB | decret electoral | 2025-01-01 | Le Decret Electoral Nov 2025 | **NEW** | no match |
| `Accord-Politique-pour-une-Gouvernance-Apaisee-et-Efficace-de-la-Periode-Interimaire.pdf` | 6637 KB | accord | 2021-09-17 | Accord Politique pour une Gouvernance Apaisee et Efficace de la Periode Interima | FOLDER-DUP of `526747291-ACCORD-POLITIQUE-POUR-UNE-GOUVERNANCE-APAISEE-ET-EFFICACE-DE-LA-PERIODE-INTERIMAIRE.pdf` | byte-identical to primary |
| `Arrete-liberant-les-membres-du-Conseil-Electoral-Provisoire-de-leurs-liens-avec-l-Administration-Publique.pdf` | 576 KB | arrete | 2021-09-27 | Arrete liberant les membres du Conseil Electoral Provisoire de leurs liens avec  | **NEW** | no match |
| `Decret portant sur la signature électronique.pdf` | 1357 KB | decret | 2016-01-29 | Decret portant sur la signature électronique | **NEW** | no match |
