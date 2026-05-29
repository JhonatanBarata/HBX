import { Injectable } from '@nestjs/common';

@Injectable()
export class RadarGoogleResponseService {
  parseLegacyGoogleResponse(
    httpStatus: number,
    data: any,
    buildGoogleApiError: (httpStatus: number, data: { status?: string; error_message?: string }) => Error,
  ) {
    const apiStatus = String(data?.status || 'OK').trim().toUpperCase();
    if (apiStatus === 'OK' || apiStatus === 'ZERO_RESULTS') {
      return data;
    }

    throw buildGoogleApiError(httpStatus, data);
  }
}
