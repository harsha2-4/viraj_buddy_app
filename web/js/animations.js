/** Replace this controller with Rive/Lottie later without changing navigation. */
export class AvatarController {
  constructor(element, { enabled = true } = {}) {
    this.element = element;
    this.enabled = enabled;
    this.motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.updateMotion = () => {
      this.element.dataset.animated = String(this.enabled && !this.motionPreference.matches);
    };
    this.motionPreference.addEventListener('change', this.updateMotion);
    this.updateMotion();
    this.setState('idle');
  }

  setState(state) {
    this.element.dataset.state = ['idle', 'happy', 'connecting', 'listening', 'thinking', 'talking'].includes(state) ? state : 'idle';
  }

  celebrate() {
    clearTimeout(this.timer);
    this.setState('happy');
    this.timer = setTimeout(() => this.setState('idle'), 550);
  }

  destroy() {
    clearTimeout(this.timer);
    this.motionPreference.removeEventListener('change', this.updateMotion);
  }
}
