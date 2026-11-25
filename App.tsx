import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { CardGallery } from './src/ui/CardGallery';
import { GameScreen } from './src/ui/GameScreen';

const showGallery = Platform.OS === 'web' && typeof location !== 'undefined' && location.search.includes('karten');

export default function App() {
  return (
    <>
      {showGallery ? <CardGallery /> : <GameScreen />}
      <StatusBar style="light" />
    </>
  );
}
