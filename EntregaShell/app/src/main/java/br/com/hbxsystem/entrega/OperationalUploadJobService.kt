package br.com.hbxsystem.entrega

import android.app.job.JobParameters
import android.app.job.JobService
import java.util.concurrent.Executors

/** Reenvia operações e comprovantes após reconexão, sobrevivendo a kill e reboot. */
class OperationalUploadJobService : JobService() {
    private val executor = Executors.newSingleThreadExecutor()

    override fun onStartJob(params: JobParameters): Boolean {
        executor.execute {
            val result = runCatching { OperationalSync.flushBlocking(applicationContext) }
                .getOrElse { OperationalFlushResult(pending = true, retry = true) }
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
