import { SubstrateExtrinsic, SubstrateEvent } from "@subql/types";
import { Codec } from "@polkadot/types/types";
import { Extrinsic, Account, Transfer, Event } from "../types";

async function createAccount(address: string): Promise<string> {
  let accountRecord = await Account.get(address);
  if (!accountRecord) {
    accountRecord = new Account(address);
    await accountRecord.save();
  }

  return address;
}

function getToken(currencyId: Codec): string {
  const currencyJson = JSON.parse(currencyId.toString());

  if (currencyJson.token) return currencyJson.token;
  if (currencyJson.dexShare) {
    const [tokenA, tokenB] = currencyJson.dexShare;
    return `${tokenA.token}<>${tokenB.token} LP`;
  }

  return "??";
}

export async function handleCurrencyDeposit(
  event: SubstrateEvent
): Promise<void> {
  if (
    event.event.section != "currencies" ||
    event.event.method != "Deposited"
  ) {
    return;
  }

  const {
    event: {
      data: [currency_id, who, amount],
    },
  } = event;

  const depositRecord = new Transfer(
    `${event.block.block.header.number.toNumber()}-${parseInt(event.event.hash.toString())}`
  );
  depositRecord.currencyId = getToken(currency_id);
  depositRecord.amount = amount.toString();
  depositRecord.toId = await createAccount(who.toString());
  depositRecord.txHash = event.extrinsic.extrinsic.hash.toString();
  depositRecord.timestamp = event.extrinsic.block.timestamp;

  await depositRecord.save();
}

export async function handleCurrencyTransfer(
  event: SubstrateEvent
): Promise<void> {
  if (
    event.event.section != "currencies" ||
    event.event.method != "Transferred"
  ) {
    return;
  }

  const {
    event: {
      data: [currency_id, from, to, amount],
    },
  } = event;

  const transferRecord = new Transfer(
    `${event.block.block.header.number.toNumber()}-${parseInt(event.event.hash.toString())}`
  );
  transferRecord.currencyId = getToken(currency_id);
  transferRecord.amount = amount.toString();
  transferRecord.toId = await createAccount(to.toString());
  transferRecord.fromId = await createAccount(from.toString());
  transferRecord.txHash = event.extrinsic.extrinsic.hash.toString();
  transferRecord.timestamp = event.extrinsic.block.timestamp;

  await transferRecord.save();
}

export async function handleEvent(event: SubstrateEvent): Promise<void> {
  if (!event.phase.isApplyExtrinsic) return;

  const eventRecord = new Event(
    `${event.block.block.header.number.toNumber()}-${event.idx}`
  );

  await handleCurrencyDeposit(event);
  await handleCurrencyTransfer(event);

  eventRecord.method = event.event.method;
  eventRecord.section = event.event.section;
  eventRecord.txId = event.extrinsic
    ? event.extrinsic.extrinsic.hash.toString()
    : null;

  await eventRecord.save();
}

export async function handleBalanceTransfer(
  extrinsic: SubstrateExtrinsic
): Promise<void> {
  if (extrinsic.extrinsic.method.section != "balances") return;
  if (!extrinsic.success) return;

  const transferEvent = extrinsic.events.find(
    (e) => e.event.section === "balances" && e.event.method === "Transfer"
  );

  if (transferEvent == undefined) return;

  const {
    event: {
      data: [from, to, value],
    },
  } = transferEvent;
  
  const transferRecord = new Transfer(
    `${extrinsic.block.block.header.number.toNumber()}-${
      parseInt(transferEvent.event.hash.toString())
    }`
  );


  transferRecord.amount = value.toString();
  transferRecord.currencyId = "KAR";
  transferRecord.toId = await createAccount(to.toString());
  transferRecord.fromId = await createAccount(from.toString());
  transferRecord.txHash = extrinsic.extrinsic.hash.toString();
  transferRecord.timestamp = extrinsic.block.timestamp;

  await transferRecord.save();
}

export async function handleCall(extrinsic: SubstrateExtrinsic): Promise<void> {
  const txRecord = new Extrinsic(`${extrinsic.extrinsic.hash.toString()}`);

  await handleBalanceTransfer(extrinsic);

  txRecord.senderId = await createAccount(
    extrinsic.extrinsic.signer.toString()
  );
  txRecord.section = extrinsic.extrinsic.method.section;
  txRecord.method = extrinsic.extrinsic.method.meta.name.toString();
  txRecord.args = extrinsic.extrinsic.args.map((arg) => arg.toString());
  txRecord.argsNames = extrinsic.extrinsic.meta.args.map((arg) =>
    arg.name.toString()
  );
  txRecord.success = extrinsic.success;
  txRecord.txId = `${extrinsic.block.block.header.number}-${extrinsic.idx}`;
  txRecord.timestamp = extrinsic.block.timestamp;

  await txRecord.save();
}
