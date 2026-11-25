import type { ImageSourcePropType } from 'react-native';
import type { CardId } from '../engine';

/**
 * Kartenbilder (eigene Designs von Till, assets/cards). Fehlende Karten werden
 * von CardFace als SVG gezeichnet. Neue Bilder hier eintragen.
 */
export const CARD_IMAGES: Partial<Record<CardId, ImageSourcePropType>> = {
  E10: require('../../assets/cards/E10.webp'),
  E7: require('../../assets/cards/E7.webp'),
  E8: require('../../assets/cards/E8.webp'),
  E9: require('../../assets/cards/E9.webp'),
  EA: require('../../assets/cards/EA.webp'),
  EK: require('../../assets/cards/EK.webp'),
  EO: require('../../assets/cards/EO.webp'),
  EU: require('../../assets/cards/EU.webp'),
  G10: require('../../assets/cards/G10.webp'),
  G7: require('../../assets/cards/G7.webp'),
  G8: require('../../assets/cards/G8.webp'),
  G9: require('../../assets/cards/G9.webp'),
  GA: require('../../assets/cards/GA.webp'),
  GK: require('../../assets/cards/GK.webp'),
  GO: require('../../assets/cards/GO.webp'),
  GU: require('../../assets/cards/GU.webp'),
  H10: require('../../assets/cards/H10.webp'),
  H7: require('../../assets/cards/H7.webp'),
  H8: require('../../assets/cards/H8.webp'),
  H9: require('../../assets/cards/H9.webp'),
  HA: require('../../assets/cards/HA.webp'),
  HK: require('../../assets/cards/HK.webp'),
  HO: require('../../assets/cards/HO.webp'),
  HU: require('../../assets/cards/HU.webp'),
  S10: require('../../assets/cards/S10.webp'),
  S7: require('../../assets/cards/S7.webp'),
  S8: require('../../assets/cards/S8.webp'),
  S9: require('../../assets/cards/S9.webp'),
  SA: require('../../assets/cards/SA.webp'),
  SK: require('../../assets/cards/SK.webp'),
  SO: require('../../assets/cards/SO.webp'),
  SU: require('../../assets/cards/SU.webp'),
};

export const CARD_BACK_IMAGE: ImageSourcePropType | null = require('../../assets/cards/back.webp');
