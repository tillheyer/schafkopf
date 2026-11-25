import { StatusBar } from 'expo-status-bar';
import { GameScreen } from './src/ui/GameScreen';

export default function App() {
  return (
    <>
      <GameScreen />
      <StatusBar style="light" />
    </>
  );
}
