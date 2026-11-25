import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Platform } from 'react-native';
import { codeFromUrl, load, save } from './src/net/storage';
import { CardGallery } from './src/ui/CardGallery';
import { LocalGame } from './src/ui/LocalGame';
import { Menu, MenuChoice } from './src/ui/Menu';
import { OnlineGame } from './src/ui/OnlineGame';

const showGallery = Platform.OS === 'web' && typeof location !== 'undefined' && location.search.includes('karten');

export default function App() {
  const [name, setNameState] = useState(() => load('schafkopf.name'));
  const [screen, setScreen] = useState<MenuChoice | null>(null);
  const setName = (n: string) => {
    setNameState(n);
    save('schafkopf.name', n);
  };
  const exit = () => setScreen(null);

  let content;
  if (showGallery) content = <CardGallery />;
  else if (!screen) content = <Menu name={name} setName={setName} initialCode={codeFromUrl()} onChoose={setScreen} />;
  else if (screen.kind === 'local') content = <LocalGame name={name.trim()} onExit={exit} />;
  else content = <OnlineGame name={name.trim()} mode={screen} onExit={exit} />;

  return (
    <>
      {content}
      <StatusBar style="light" />
    </>
  );
}
