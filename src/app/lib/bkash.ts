import config from "../config";
import { redisClient } from "./redis";

export const getBkashIdToken = async () => {
  try {
    const idTokenKey = "bkash:id_token";
    const refreshTokenKey = "bkash:refresh_token";

    const bkashIdToken = await redisClient.get(idTokenKey);
    const bkashRefreshToken = await redisClient.get(refreshTokenKey);

    if (bkashIdToken) {
      return bkashIdToken;
    }

    if (bkashRefreshToken) {
      const refreshTokenResponse = await fetch(
        `${config.bkash_base_url}/tokenized/checkout/token/refresh`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            username: config.bkash_username,
            password: config.bkash_password,
          },
          body: JSON.stringify({
            app_key: config.bkash_app_key,
            app_secret: config.bkash_app_secret,
            refresh_token: bkashRefreshToken,
          }),
        },
      );

      if (!refreshTokenResponse.ok) {
        throw new Error("Bkash Refresh Token failed");
      }

      const refreshTokenResult = await refreshTokenResponse.json();

      await redisClient.set(idTokenKey, refreshTokenResult?.id_token, {
        EX: 60 * 50,
      });

      if (refreshTokenResult?.refresh_token) {
        await redisClient.set(
          refreshTokenKey,
          refreshTokenResult?.refresh_token,
          {
            EX: 60 * 60 * 24 * 28,
          },
        );
      }
      return refreshTokenResult?.id_token as string;
    }
    // first time generate idToken ---

    const grantTokenResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/token/grant`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          username: config.bkash_username,
          password: config.bkash_password,
        },
        body: JSON.stringify({
          app_key: config.bkash_app_key,
          app_secret: config.bkash_app_secret,
        }),
      },
    );
    if (!grantTokenResponse.ok) {
      throw new Error("Bkash Access Token Grant Failed");
    }

    const result = await grantTokenResponse.json();

    await redisClient.set(idTokenKey, result?.id_token, {
      EX: 60 * 50,
    });

    await redisClient.set(refreshTokenKey, result?.refresh_token, {
      expiration: {
        type: "EX",
        value: 60 * 60 * 24 * 28,
      },
    });

    return result.id_token;
  } catch (error: any) {
    throw new Error(error.message);
  }
};
