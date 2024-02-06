import { webpack } from 'webpack';

import webpackConfig from './webpack.base';

export const prodConfig = {
  ...webpackConfig,
  mode: 'production',
} as const;

webpack(prodConfig).run((err, stats) => {
  return new Promise((resolve, reject) => {
    if (err) {
      return reject(err);
    }

    if (stats) {
      if (stats.hasErrors()) {
        const errors = stats.toJson().errors;
        errors?.forEach(console.error);

        return reject('');
      }
    }

    return resolve('');
  }).catch(() => {});
});
