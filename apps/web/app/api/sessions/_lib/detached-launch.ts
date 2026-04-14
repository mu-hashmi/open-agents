export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function buildDetachedLaunchCommand(params: {
  command: string;
  pidFilePath: string;
  logFilePath: string;
  startupProbeDelaySeconds?: number;
}): string {
  const startupProbeDelaySeconds = params.startupProbeDelaySeconds ?? 1;

  return [
    `rm -f ${shellQuote(params.pidFilePath)}`,
    `{ nohup ${params.command} > ${shellQuote(params.logFilePath)} 2>&1 < /dev/null & pid=$!; printf '%s' "$pid" > ${shellQuote(params.pidFilePath)} && sleep ${startupProbeDelaySeconds} && kill -0 "$pid"; }`,
  ].join(" && ");
}
