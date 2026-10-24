import { expect, test } from 'vitest';
import { looksEnglish } from '@/lib/essay/english';

const ENGLISH = 'Social media has changed the way that teenagers talk to each other. Many students now spend more time on their phones '
  + 'than with their friends, and this can make it harder for them to focus in class. However, it is also true that these apps help '
  + 'people who feel alone to find others with the same interests. Schools should therefore teach students how to use them well.';
const SPANISH = 'Las redes sociales han cambiado la manera en que los jóvenes se comunican entre sí. Muchos estudiantes pasan más tiempo '
  + 'con sus teléfonos que con sus amigos, y esto puede dificultar que se concentren en clase. Sin embargo, también es cierto que '
  + 'estas aplicaciones ayudan a las personas que se sienten solas a encontrar a otras con los mismos intereses.';
const FILIPINO = 'Malaki ang naging pagbabago ng social media sa paraan ng pakikipag-usap ng mga kabataan. Maraming estudyante ang mas '
  + 'matagal na gumagamit ng kanilang telepono kaysa makasama ang kanilang mga kaibigan, at dahil dito ay nahihirapan silang '
  + 'makapag-isip nang mabuti sa klase. Gayunpaman, nakatutulong din ang mga app na ito sa mga taong nag-iisa.';
const FORMAL = 'Photosynthesis converts light energy into chemical energy. Chlorophyll absorbs photons, exciting electrons within '
  + 'thylakoid membranes. Subsequently, the Calvin cycle fixes atmospheric carbon dioxide into glucose, which plants store as starch '
  + 'or use immediately for cellular respiration. Consequently, ecosystems depend upon this process for energy.';

test.each([['plain English', ENGLISH, true], ['dense academic English', FORMAL, true], ['Spanish', SPANISH, false], ['Filipino', FILIPINO, false]])(
  '%s -> %s', (_, text, expected) => { expect(looksEnglish(text)).toBe(expected); });
