package br.com.hbxsystem.entrega

import android.app.job.JobParameters
import android.app.job.JobService
import java.util.concurrent.Executors

/** Reenvio durável ao reconectar, sem Firebase e sem WorkManager/GMS. */
class TrackingUploadJobService : JobService() {
    private val executor = Executors.newSingleThreadExecutor()

    override fun onStartJob(params: JobParameters): Boolean {
        executor.execute {
            val result = runCatching { TrackingSync.flushBlocking(applicationContext) }
                .getOrElse { TrackingFlushResult(pending = true, retry = true) }
            jobFinished(params, result.retry)
        }
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean = true

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }
}
