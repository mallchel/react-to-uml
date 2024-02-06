import { Child } from './Child';
import { Icon } from './Icon';

export const Button = () => {
  return (
    <button>
      <Child />
      <Icon />
    </button>
  );
};

export const Test = () => {
  return <Child />;
};
