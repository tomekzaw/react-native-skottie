import '@shopify/react-native-skia'; // Important: register skia module
import type { NativeSkiaViewProps } from '@shopify/react-native-skia/lib/typescript/src';
import { SkiaViewNativeId } from '@shopify/react-native-skia';
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { SkiaViewApi } from './SkiaViewApi';

import type { AnimationObject } from './types';
import { NativeSkiaSkottieView } from './NativeSkiaSkottieView';
import {
  SkSkottie,
  makeSkSkottieFromString,
  makeSkSkottieFromUri,
} from './NativeSkottieModule';
import { SharedValue, startMapper, stopMapper } from 'react-native-reanimated';
import { Image } from 'react-native';

export type ResizeMode = 'cover' | 'contain' | 'stretch';

export type SkiaSkottieViewProps = NativeSkiaViewProps & {
  source: number | string | AnimationObject;

  /**
   * A boolean flag indicating whether or not the animation should start automatically when
   * mounted.
   */
  autoPlay?: boolean;

  /**
   * The speed the animation will progress. This only affects the imperative API. The
   * default value is 1.
   */
  speed?: number;

  /**
   * The duration of the animation in ms. Takes precedence over speed when set.
   * This only works when source is an actual JS object of an animation.
   */
  duration?: number;

  /**
   * A boolean flag indicating whether or not the animation should loop.
   */
  loop?: boolean;

  /**
   * Provide a reanimated shared value between 0 and 1 to control the animation progress.
   */
  progress?: SharedValue<number>;

  /**
   * @default contain
   */
  resizeMode?: ResizeMode;

  /**
   * Called when the animation is finished playing.
   * Note: this will be called multiple times if the animation is looping.
   */
  onAnimationFinish?: () => void;
};

export type SkiaSkottieViewRef = {
  play: () => void;
  pause: () => void;
  reset: () => void;
};

export const SkiaSkottieView = React.forwardRef<
  SkiaSkottieViewRef,
  SkiaSkottieViewProps
>((props, ref) => {
  const nativeId = useRef(SkiaViewNativeId.current++).current;

  //#region Compute values
  const source = useMemo(() => {
    let _source: string | { sourceDotLottieURI: string };
    if (typeof props.source === 'string') {
      _source = props.source;
    } else if (typeof props.source === 'object') {
      _source = JSON.stringify(props.source);
    } else if (typeof props.source === 'number') {
      const uri = Image.resolveAssetSource(props.source)?.uri;
      if (uri == null) {
        throw Error(
          '[react-native-skottie] Invalid src prop provided. Cant resolve asset source.'
        );
      }
      _source = { sourceDotLottieURI: uri };
    } else {
      throw Error('[react-native-skottie] Invalid src prop provided.');
    }
    return _source;
  }, [props.source]);

  const skottieAnimation = useMemo(() => {
    if (typeof source === 'string') {
      return makeSkSkottieFromString(source);
    } else {
      return makeSkSkottieFromUri(source.sourceDotLottieURI);
    }
  }, [source]);

  const progress = props.progress;

  const updateAnimation = useCallback(
    (animation: SkSkottie) => {
      assertSkiaViewApi();
      SkiaViewApi.setJsiProperty(nativeId, 'src', animation);
    },
    [nativeId]
  );

  const updateResizeMode = useCallback(
    (resizeMode: ResizeMode) => {
      assertSkiaViewApi();
      SkiaViewApi.setJsiProperty(nativeId, 'scaleType', resizeMode);
    },
    [nativeId]
  );
  //#endregion

  useLayoutEffect(() => {
    updateResizeMode(props.resizeMode ?? 'contain');
  }, [nativeId, props.resizeMode, updateResizeMode]);

  useLayoutEffect(() => {
    updateAnimation(skottieAnimation);
  }, [nativeId, skottieAnimation, source, updateAnimation]);

  // Handle animation updates
  useEffect(() => {
    const _progress = progress;
    if (_progress == null) {
      return;
    }

    assertSkiaViewApi();
    const mapperId = startMapper(() => {
      'worklet';
      try {
        SkiaViewApi.setJsiProperty(nativeId, 'setProgress', _progress.value);
      } catch (e) {
        // ignored, view might not be ready yet
        if (props.debug) {
          console.warn(e);
        }
      }
    }, [progress]);

    return () => {
      stopMapper(mapperId);
    };
  }, [nativeId, progress, props.debug]);

  //#region Imperative API
  const start = useCallback(() => {
    assertSkiaViewApi();
    SkiaViewApi.setJsiProperty(nativeId, 'start', null);
  }, [nativeId]);

  useImperativeHandle(
    ref,
    () => ({
      play: start,
      pause: () => {
        assertSkiaViewApi();
        SkiaViewApi.setJsiProperty(nativeId, 'pause', null);
      },
      reset: () => {
        assertSkiaViewApi();
        SkiaViewApi.setJsiProperty(nativeId, 'reset', null);
      },
    }),
    [nativeId, start]
  );
  //#endregion

  // Start the animation
  const shouldPlay = progress == null && props.autoPlay;
  useEffect(() => {
    if (shouldPlay) {
      start();
    }

    // const speed = props.speed ?? 1;
    // const duration = (skottieAnimation.duration * 1000) / speed;
    // const doneCallback = props.onAnimationFinish;
  }, [
    progress,
    props.autoPlay,
    props.onAnimationFinish,
    props.speed,
    shouldPlay,
    skottieAnimation.duration,
    start,
  ]);

  const { debug = false, ...viewProps } = props;

  return (
    <NativeSkiaSkottieView
      collapsable={false}
      nativeID={`${nativeId}`}
      debug={debug}
      {...viewProps}
      mode={shouldPlay ? 'continuous' : 'default'}
    />
  );
});

const assertSkiaViewApi = () => {
  if (
    SkiaViewApi === null ||
    SkiaViewApi.setJsiProperty === null ||
    SkiaViewApi.callJsiMethod === null ||
    SkiaViewApi.registerValuesInView === null ||
    SkiaViewApi.requestRedraw === null ||
    SkiaViewApi.makeImageSnapshot === null
  ) {
    throw Error('Skia View Api was not found.');
  }
};
