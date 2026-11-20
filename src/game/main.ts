import './ui/styles.css';
import { Game } from './core/Game';
const app=document.getElementById('app');
if(app)new Game(app);
