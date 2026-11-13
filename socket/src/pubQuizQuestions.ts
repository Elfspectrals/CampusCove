import type { QuizChoice, QuizQuestion, QuizText } from './pubQuiz.ts'

type Line = readonly [fr: string, en: string]

function text([fr, en]: Line): QuizText {
  return { fr, en }
}

function world(prompt: Line, choices: readonly [Line, Line, Line, Line], answer: QuizChoice): QuizQuestion {
  return { topic: 'world', prompt: text(prompt), choices: [text(choices[0]), text(choices[1]), text(choices[2]), text(choices[3])], answer }
}

function general(prompt: Line, choices: readonly [Line, Line, Line, Line], answer: QuizChoice): QuizQuestion {
  return { ...world(prompt, choices, answer), topic: 'general' }
}

function same(value: string): Line {
  return [value, value]
}

export const QUIZ_BANK: readonly QuizQuestion[] = [
  world(['Comment s’appelle le pub de la ville ?', 'What is the name of the town pub?'],
    [same('The Salty Shamrock'), same('The Rusty Anchor'), same('The Golden Goose'), same('The Lucky Clover')], 0),
  world(['Où se fait-on soigner après un malaise ?', 'Where do you wake up after passing out?'],
    [same('Cove Home'), same('Cove Clinic'), same('Cove Threads'), same('GreenCart')], 1),
  world(['Quelle boutique vend des vêtements ?', 'Which shop sells clothes?'],
    [same('GreenCart'), same('Cove Clinic'), same('Cove Threads'), same('Cove Home')], 2),
  world(['À qui vend-on les pommes du verger ?', 'Who buys the orchard’s apples?'],
    [['Au barman', 'The bartender'], ['Au fermier', 'The farmer'], ['À GreenCart', 'GreenCart'], ['Au videur', 'The bouncer']], 1),
  world(['Qui garde la porte de la salle secrète du pub ?', 'Who guards the door to the pub’s secret room?'],
    [['Le barman', 'The bartender'], ['Le videur', 'The bouncer'], ['Le fermier', 'The farmer'], ['L’infirmière', 'The nurse']], 1),
  world(['Où retire-t-on du cash en ville ?', 'Where do you withdraw cash in town?'],
    [['À la mairie', 'At the town hall'], ['Au bar', 'At the bar'], ['À un distributeur', 'At an ATM'], ['À la ferme', 'At the farm']], 2),
  world(['Que faut-il pour envoyer un virement à un autre joueur ?', 'What do you need to send a transfer to another player?'],
    [['Son pseudo#tag', 'Their name#tag'], ['Son e-mail', 'Their e-mail'], ['Son adresse', 'Their address'], ['Rien', 'Nothing']], 0),
  world(['Quel jeu du pub se joue avec une pinte à vider en équilibre ?', 'Which pub game is about emptying a pint while keeping it balanced?'],
    [['Les fléchettes', 'Darts'], ['Drink Fast', 'Drink Fast'], ['Le billard', 'Pool'], ['Le quiz', 'The quiz']], 1),
  world(['Combien de fléchettes lance-t-on par tour au pub ?', 'How many darts do you throw per turn at the pub?'],
    [same('1'), same('2'), same('3'), same('5')], 2),
  world(['Que perd-on en mourant ?', 'What do you lose when you die?'],
    [['Sa maison', 'Your house'], ['Le cash porté sur soi', 'The cash you carry'], ['Son compte en banque', 'Your bank account'], ['Ses amis', 'Your friends']], 1),
  world(['Dans quelle boutique achète-t-on des courses ?', 'Which shop sells groceries?'],
    [same('GreenCart'), same('Cove Threads'), same('Northline'), same('Cove Clinic')], 0),
  world(['Quel est le premier job de la ville ?', 'What is the town’s first job?'],
    [['Pêcheur', 'Fishing'], ['Cueillir des pommes', 'Picking apples'], ['Barman', 'Bartending'], ['Policier', 'Police']], 1),
  world(['Quelle touche ouvre la bulle de discussion par défaut ?', 'Which key opens the chat bubble by default?'],
    [same('T'), same('Enter'), same('C'), same('Tab')], 1),
  world(['De quoi a-t-on besoin pour entrer dans la salle secrète du pub ?', 'What do you need to get into the pub’s secret room?'],
    [['Une clé', 'A key'], ['Le mot de passe', 'The password'], ['Un ticket', 'A ticket'], ['100 coins', '100 coins']], 1),
  world(['Que montre la montre en jeu ?', 'What does the watch show in the game?'],
    [['La météo', 'The weather'], ['La faim et la soif', 'Hunger and thirst'], ['Les coins', 'Coins'], ['La carte', 'The map']], 1),

  general(['Quelle est la capitale de l’Australie ?', 'What is the capital of Australia?'],
    [same('Sydney'), same('Melbourne'), same('Canberra'), same('Perth')], 2),
  general(['Combien de joueurs une équipe de football aligne-t-elle sur le terrain ?', 'How many players does a football team have on the pitch?'],
    [same('9'), same('10'), same('11'), same('12')], 2),
  general(['Quelle planète est la plus proche du Soleil ?', 'Which planet is closest to the Sun?'],
    [['Vénus', 'Venus'], ['Mercure', 'Mercury'], ['Mars', 'Mars'], ['La Terre', 'Earth']], 1),
  general(['Qui a peint la Joconde ?', 'Who painted the Mona Lisa?'],
    [['Michel-Ange', 'Michelangelo'], ['Raphaël', 'Raphael'], ['Léonard de Vinci', 'Leonardo da Vinci'], ['Botticelli', 'Botticelli']], 2),
  general(['Quel est le symbole chimique de l’or ?', 'What is the chemical symbol for gold?'],
    [same('Go'), same('Au'), same('Ag'), same('Gd')], 1),
  general(['Combien de côtés a un hexagone ?', 'How many sides does a hexagon have?'],
    [same('5'), same('6'), same('7'), same('8')], 1),
  general(['Quel est le plus grand océan du monde ?', 'What is the largest ocean on Earth?'],
    [['Atlantique', 'Atlantic'], ['Indien', 'Indian'], ['Arctique', 'Arctic'], ['Pacifique', 'Pacific']], 3),
  general(['En quelle année l’homme a-t-il marché sur la Lune pour la première fois ?', 'In which year did a human first walk on the Moon?'],
    [same('1965'), same('1969'), same('1972'), same('1959')], 1),
  general(['Quel pays a la forme d’une botte ?', 'Which country is shaped like a boot?'],
    [['L’Espagne', 'Spain'], ['La Grèce', 'Greece'], ['L’Italie', 'Italy'], ['Le Portugal', 'Portugal']], 2),
  general(['Combien de minutes y a-t-il dans une journée ?', 'How many minutes are there in a day?'],
    [same('1 440'), same('1 200'), same('3 600'), same('2 400')], 0),
  general(['Quel animal est le plus grand mammifère du monde ?', 'What is the largest mammal in the world?'],
    [['L’éléphant', 'The elephant'], ['La baleine bleue', 'The blue whale'], ['La girafe', 'The giraffe'], ['Le requin-baleine', 'The whale shark']], 1),
  general(['De quel pays vient la Guinness ?', 'Which country does Guinness come from?'],
    [['L’Écosse', 'Scotland'], ['L’Angleterre', 'England'], ['L’Irlande', 'Ireland'], ['La Belgique', 'Belgium']], 2),
  general(['Quel est le plus long fleuve de France ?', 'What is the longest river in France?'],
    [['La Seine', 'The Seine'], ['La Loire', 'The Loire'], ['Le Rhône', 'The Rhône'], ['La Garonne', 'The Garonne']], 1),
  general(['Combien de cordes a une guitare classique ?', 'How many strings does a classical guitar have?'],
    [same('4'), same('5'), same('6'), same('7')], 2),
  general(['Quel gaz les plantes absorbent-elles pour la photosynthèse ?', 'Which gas do plants take in for photosynthesis?'],
    [['L’oxygène', 'Oxygen'], ['L’azote', 'Nitrogen'], ['Le dioxyde de carbone', 'Carbon dioxide'], ['L’hélium', 'Helium']], 2),
  general(['Quelle est la monnaie du Japon ?', 'What is the currency of Japan?'],
    [['Le yuan', 'The yuan'], ['Le won', 'The won'], ['Le yen', 'The yen'], ['Le baht', 'The baht']], 2),
  general(['Combien d’os compte le corps humain adulte ?', 'How many bones does an adult human body have?'],
    [same('186'), same('206'), same('226'), same('306')], 1),
  general(['Qui a écrit « Roméo et Juliette » ?', 'Who wrote “Romeo and Juliet”?'],
    [['Molière', 'Molière'], ['Shakespeare', 'Shakespeare'], ['Victor Hugo', 'Victor Hugo'], ['Dickens', 'Dickens']], 1),
  general(['Quelle est la vitesse de la lumière, à peu près ?', 'Roughly how fast does light travel?'],
    [['300 000 km/s', '300,000 km/s'], ['30 000 km/s', '30,000 km/s'], ['3 000 km/s', '3,000 km/s'], ['3 000 000 km/s', '3,000,000 km/s']], 0),
  general(['Dans quel sport utilise-t-on un volant ?', 'Which sport uses a shuttlecock?'],
    [['Le tennis', 'Tennis'], ['Le badminton', 'Badminton'], ['Le squash', 'Squash'], ['Le ping-pong', 'Table tennis']], 1),
  general(['Quel est le plus haut sommet du monde ?', 'What is the highest mountain in the world?'],
    [['Le K2', 'K2'], ['Le mont Blanc', 'Mont Blanc'], ['L’Everest', 'Everest'], ['Le Kilimandjaro', 'Kilimanjaro']], 2),
  general(['Combien de pattes a une araignée ?', 'How many legs does a spider have?'],
    [same('6'), same('8'), same('10'), same('12')], 1),
  general(['Quel instrument a 88 touches ?', 'Which instrument has 88 keys?'],
    [['L’orgue', 'The organ'], ['L’accordéon', 'The accordion'], ['Le piano', 'The piano'], ['Le xylophone', 'The xylophone']], 2),
  general(['Quelle est la capitale du Canada ?', 'What is the capital of Canada?'],
    [same('Toronto'), same('Ottawa'), same('Montréal'), same('Vancouver')], 1),
  general(['De quelle couleur est l’émeraude ?', 'What colour is an emerald?'],
    [['Rouge', 'Red'], ['Bleue', 'Blue'], ['Verte', 'Green'], ['Jaune', 'Yellow']], 2),
  general(['Combien de joueurs y a-t-il dans une équipe de basket sur le terrain ?', 'How many players does a basketball team have on the court?'],
    [same('4'), same('5'), same('6'), same('7')], 1),
  general(['Quel est l’ingrédient principal du guacamole ?', 'What is the main ingredient of guacamole?'],
    [['La tomate', 'Tomato'], ['L’avocat', 'Avocado'], ['Le concombre', 'Cucumber'], ['Le poivron', 'Pepper']], 1),
  general(['Quel pays a offert la statue de la Liberté aux États-Unis ?', 'Which country gave the Statue of Liberty to the United States?'],
    [['Le Royaume-Uni', 'The United Kingdom'], ['La France', 'France'], ['L’Espagne', 'Spain'], ['L’Italie', 'Italy']], 1),
  general(['Combien de continents compte-t-on habituellement ?', 'How many continents are usually counted?'],
    [same('5'), same('6'), same('7'), same('8')], 2),
  general(['Quel est le plus petit nombre premier ?', 'What is the smallest prime number?'],
    [same('0'), same('1'), same('2'), same('3')], 2),
  general(['Quelle boisson est faite avec du houblon ?', 'Which drink is made with hops?'],
    [['Le vin', 'Wine'], ['La bière', 'Beer'], ['Le cidre', 'Cider'], ['Le whisky', 'Whisky']], 1),
  general(['Quel organe pompe le sang dans le corps ?', 'Which organ pumps blood around the body?'],
    [['Le foie', 'The liver'], ['Les poumons', 'The lungs'], ['Le cœur', 'The heart'], ['Les reins', 'The kidneys']], 2),
  general(['Dans quelle ville se trouve la tour Eiffel ?', 'In which city is the Eiffel Tower?'],
    [same('Lyon'), same('Paris'), same('Marseille'), ['Bruxelles', 'Brussels']], 1),
  general(['Combien de cartes compte un jeu classique, sans les jokers ?', 'How many cards are in a standard deck, without jokers?'],
    [same('32'), same('48'), same('52'), same('54')], 2),
  general(['Quel est l’animal national de l’Écosse ?', 'What is the national animal of Scotland?'],
    [['Le lion', 'The lion'], ['La licorne', 'The unicorn'], ['Le cerf', 'The stag'], ['L’aigle', 'The eagle']], 1)
]
