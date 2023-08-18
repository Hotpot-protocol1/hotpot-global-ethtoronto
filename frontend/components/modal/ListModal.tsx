import React, {
  Dispatch,
  SetStateAction,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react'
import { ethers } from 'ethers'
import { SWRResponse } from 'swr'
import { TokenDetails } from 'types/reservoir'
import { optimizeImage } from 'lib/optmizeImage'
import { useMediaQuery } from '@react-hookz/web'
import * as Dialog from '@radix-ui/react-dialog'
import * as Switch from '@radix-ui/react-switch'
import * as Select from '@radix-ui/react-select'
import { CgChevronDown, CgMore, CgSpinner } from 'react-icons/cg'
import { setToast } from 'components/token/setToast'
import { useAccount, useContract, useProvider, useSigner } from 'wagmi'
import { HiCheckCircle, HiExclamationCircle, HiX } from 'react-icons/hi'
import {
  abi,
  ERC721abi,
  NFTMarketplace_CONTRACT_SEP,
} from '../../contracts/index'
import InfoTooltip from 'components/InfoTooltip'
import dayjs, { ManipulateType } from 'dayjs'
import Image from 'next/legacy/image'
import Modal from './Modal'
import useTix from 'lib/tix'

export type ExpirationOption = {
  text: string
  value: string
  relativeTime: number | null
  relativeTimeUnit: ManipulateType | null
}

const expirationOptions: ExpirationOption[] = [
  {
    text: '1 Hour',
    value: 'hour',
    relativeTime: 1,
    relativeTimeUnit: 'h',
  },
  {
    text: '12 Hours',
    value: '12 hours',
    relativeTime: 12,
    relativeTimeUnit: 'h',
  },
  {
    text: '1 Day',
    value: '1 day',
    relativeTime: 1,
    relativeTimeUnit: 'd',
  },
  {
    text: '3 Day',
    value: '3 days',
    relativeTime: 3,
    relativeTimeUnit: 'd',
  },
  { text: '1 Week', value: 'week', relativeTime: 1, relativeTimeUnit: 'w' },
  { text: '1 Month', value: 'month', relativeTime: 1, relativeTimeUnit: 'M' },
  {
    text: '3 Months',
    value: '3 months',
    relativeTime: 3,
    relativeTimeUnit: 'M',
  },
  {
    text: '6 Months',
    value: '6 months',
    relativeTime: 6,
    relativeTimeUnit: 'M',
  },
]

const ModalCopy = {
  title: 'List Item for sale',
  ctaClose: 'Close',
  ctaSetPrice: 'Set your price',
  ctaList: 'List for Sale',
  ctaAwaitingApproval: 'Waiting for Approval',
  ctaEditListing: 'Edit Listing',
  ctaRetry: 'Retry',
  ctaGoToToken: 'Go to Token',
}

enum STEPS {
  SelectMarkets = 0,
  SetPrice = 1,
  ListItem = 2,
  Complete = 3,
}

type Props = Pick<Parameters<typeof Modal>['0'], 'trigger'> & {
  openState?: [boolean, Dispatch<SetStateAction<boolean>>]
  tokenId?: string
  tokenDetails?: TokenDetails
  collectionId?: string
  nativeOnly?: boolean
  normalizeRoyalties?: boolean
  enableOnChainRoyalties?: boolean
  oracleEnabled?: boolean
  copyOverrides?: Partial<typeof ModalCopy>
  feesBps?: string[]
  onGoToToken?: () => any
  onListingError?: (error: Error) => void
  onClose?: () => void
  mutate?: SWRResponse['mutate']
}

const ListModal: React.FC<Props> = ({
  trigger,
  tokenId,
  tokenDetails,
  collectionId,
  onListingError,
  mutate,
}) => {
  const [step, setStep] = useState(STEPS.SelectMarkets)
  const [isLoading, setIsLoading] = useState(false)
  const provider = useProvider()
  const { data: signer } = useSigner()
  const account = useAccount()
  const [isMounted, setIsMounted] = useState<boolean>(false)
  const [error, setError] = useState<Error | null>(null)
  const [priceValue, setPriceValue] = useState<number>(0)
  const [isApproved, setIsApproved] = useState<boolean>(false)
  const [alert, setAlert] = useState<string | null>(null)
  const [txn, setTxn] = useState<string>('')
  const [expirationOption, setExpirationOption] = useState<ExpirationOption>(
    expirationOptions[5]
  )

  const singleColumnBreakpoint = useMediaQuery('(max-width: 640px)')
  const imageSize = singleColumnBreakpoint ? 533 : 250

  useEffect(() => {
    setIsMounted(true)
  }, [])
  const nftPriceRef = useRef<number>(0)

  const NftMarketplace = useContract({
    address: NFTMarketplace_CONTRACT_SEP,
    abi: abi,
    signerOrProvider: signer || provider,
  })

  const Nft = useContract({
    address: collectionId,
    abi: ERC721abi,
    signerOrProvider: signer || provider,
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPriceValue = Number(e.target.value)
    if (newPriceValue <= 0) {
      setAlert('Price must be greater than 0.')
    } else {
      setAlert(null)
    }
    setPriceValue(newPriceValue)
    nftPriceRef.current = newPriceValue
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    setStep(2)
    setError(null)

    try {
      const nftPrice = nftPriceRef.current
      const nftPriceWei = ethers.utils.parseUnits(nftPrice.toString(), 18)

      if (!NftMarketplace) {
        console.log('NftMarketplace contract instance is not available.')
        return
      }
      if (!Nft) {
        console.log('Nft contract instance is not available.')
        return
      }
      let expirationTime: string | null = null

      if (expirationOption.relativeTime && expirationOption.relativeTimeUnit) {
        expirationTime = dayjs()
          .add(expirationOption.relativeTime, expirationOption.relativeTimeUnit)
          .unix()
          .toString()
      }

      // Check if Hotpot is already approved to manage all of the owner's tokens
      const isAlreadyApproved = await Nft.isApprovedForAll(
        account.address,
        NftMarketplace.address
      )

      if (!isAlreadyApproved) {
        // If not approved, call the `setApprovalForAll` function on the NFT contract
        const approvalTx = await Nft.setApprovalForAll(
          NftMarketplace.address,
          true
        )
        console.log('Approval Transaction Hash:', approvalTx.hash)
        await approvalTx.wait() // Wait for the approval transaction to be confirmed
      }

      // After approval, call the `makeItem` function on the Hotpot marketplace
      const listingTx = await NftMarketplace.makeItem(
        collectionId,
        tokenId,
        nftPriceWei
      )
      setIsApproved(true)
      console.log('Listing Transaction Hash:', listingTx.hash)
      setTxn(listingTx.hash)
      await listingTx.wait()
      setIsApproved(false)
      setIsLoading(false)
      setToast({
        kind: 'success',
        message: 'Your item was listed successfully',
        title: 'Success!',
      })
      setStep(3)
    } catch (error) {
      setIsLoading(false)
      console.log(error)
      if (error instanceof Error) {
        setError(error)
      } else {
        setError(new Error('An unknown error occurred.'))
      }
    }
  }

  const onEdit = () => {
    setStep(1)
    setError(null)
  }

  const onClose = () => {
    setStep(0)
    setError(null)
    setAlert(null)
    setPriceValue(0)
    if (mutate) {
      mutate()
    }
  }

  useEffect(() => {
    if (error && onListingError) {
      onListingError(error)
    }
  }, [error])

  const onNext = () => {
    setStep((value) => value + 1)
  }

  const actionLabel = useMemo(() => {
    if (step === STEPS.ListItem) {
      setIsLoading(true)
      return 'Waiting for Approval'
    }
    if (step === STEPS.Complete) {
      setIsLoading(false)
      return 'Close'
    }
    setIsLoading(false)
    return 'Next'
  }, [step])

  const secondaryActionLabel = useMemo(() => {
    if (step === STEPS.ListItem) {
      return onEdit
    }
    return undefined
  }, [step])

  const primaryAction = useMemo(() => {
    if (isLoading) {
      return undefined
    }
    if (step === STEPS.Complete) {
      return onClose
    }
    if (error) {
      return handleSubmit
    }

    if (step === STEPS.SetPrice) {
      return handleSubmit
    }

    return onNext
  }, [step, isLoading, error, priceValue])

  if (!isMounted) {
    return null
  }

  const tix = useTix(priceValue ?? '0')
  const shortTxn = txn.slice(0, 4) + '...' + txn.slice(-4)
  let mainContent = (
    <div>
      <div className="mb-4 flex flex-row rounded border border-[#FFD027] bg-[#FFF1CC] py-2 px-2 text-sm font-normal">
        <img src="/eth-gold.svg" className="h-8 w-8" />
        <div>
          {' '}
          To ensure you{' '}
          <span className="text-[#FF991C]">earn golden tickets</span> to draw to
          win <span className="text-[#FF991C]">100 ETH</span>, list at the most
          competitive price on Hotpot.
        </div>
      </div>
      <div className="text-base font-medium text-gray-900">
        Available Marketplace
      </div>
      <div>
        <div className="mt-4 text-sm text-gray-500">Default</div>
        <div className="text-md mt-2 flex flex-row justify-between font-medium">
          <div className="flex flex-row items-center justify-center gap-2 text-gray-700">
            <img src="/hotpot.png" className="h-8 w-8" />
            <div>Hotpot</div>
          </div>
          <div
            className="flex items-center"
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <label
              className="pr-[15px] text-[14px] leading-none text-gray-700"
              htmlFor="hotpot-marketplace"
            >
              To Pot: 1%
            </label>
            <Switch.Root
              className="relative h-[25px] w-[42px] cursor-default rounded-full bg-blackA9 shadow-[0_2px_10px] shadow-blackA7 focus:shadow-[0_0_0_2px] focus:shadow-black data-[state=checked]:bg-[#F6E359]"
              id="Hotpot MarketPlace"
              style={{ WebkitTapHighlightColor: 'rgba(0, 0, 0, 0)' }}
              disabled
              checked
            >
              <Switch.Thumb className="block h-[21px] w-[21px] translate-x-0.5 rounded-full bg-white shadow-[0_2px_2px] shadow-blackA7 transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[19px]" />
            </Switch.Root>
          </div>
        </div>
      </div>
    </div>
  )

  let sideContent = (
    <div className="grid-row mt-2 grid gap-1">
      <div className="flex flex-row justify-between rounded bg-[#F3F2F2] p-2">
        <div className="flex flex-row gap-1 text-sm text-gray-600">
          <div>Creator Royalties</div>
          <InfoTooltip
            side="top"
            width={200}
            content="A fee on every order that goes to the collection creator."
          />
        </div>
        <div className="text-sm ">-</div>
      </div>
      <div className="flex flex-row justify-between rounded bg-[#F3F2F2] p-2">
        <div className="text-sm text-gray-600">Last Sale</div>
        <div className="text-sm ">-</div>
      </div>
      <div className="flex flex-row justify-between rounded bg-[#F3F2F2] p-2">
        <div className="text-sm text-gray-600">Collection Floor</div>
        <div className="text-sm ">-</div>
      </div>
      <div className="flex flex-row justify-between rounded bg-[#F3F2F2] p-2">
        <div className="flex flex-row gap-1 text-sm text-gray-600">
          <div>Highest Trait Floor</div>
          <InfoTooltip
            side="top"
            width={200}
            content="The floor price of the most valuable trait of a token."
          />
        </div>
        <div className="text-sm ">-</div>
      </div>
    </div>
  )

  if (step === STEPS.SetPrice) {
    mainContent = (
      <div>
        {' '}
        <div>
          <div className="mt-4 text-base font-medium text-gray-900">
            Set Your Price
          </div>
          <div>
            <div className="mt-4 flex flex-row justify-between ">
              <div className="text-sm text-gray-500">List Price</div>
              <div className="flex flex-row items-center justify-center gap-2">
                {tix > 0 && (
                  <div className="z-10 flex items-center justify-center truncate rounded border border-[#0FA46E] bg-[#DBF1E4] px-2 text-sm font-normal text-[#0FA46E]">
                    +{tix} TIX
                  </div>
                )}
                <div className="text-sm text-gray-500">Profit</div>
                <InfoTooltip
                  side="top"
                  width={200}
                  content="How much you will receive"
                />
              </div>
            </div>

            <div className="text-md mt-2 flex flex-row justify-between">
              <div className="flex flex-row items-center gap-2 text-gray-700">
                <div className="flex items-center">
                  <img src="/hotpot.png" className="mr-4 h-8 w-8 flex-none" />
                  <img src="/eth.svg" className="mr-1 h-4 w-4" alt="price" />
                  <div className="">ETH</div>
                </div>
              </div>
              <input
                disabled={false}
                onChange={handleChange}
                type="number"
                placeholder="Enter a listing price"
                className="mx-2 grow rounded border-2 px-4 py-2 hover:border-blue-700"
              />

              <div
                className="flex items-center"
                style={{ display: 'flex', alignItems: 'center' }}
              >
                <img src="/eth.svg" className="mr-1 h-3 w-3" alt="price" />
                <label
                  className="grow-0 truncate pr-[15px] text-[14px] font-medium leading-none text-gray-700"
                  htmlFor="hotpot-marketplace"
                >
                  {priceValue}
                </label>
              </div>
            </div>
            <div className="items-center justify-center p-1 text-xs font-light text-red-500">
              {alert}
            </div>
            <div className="items-left mt-4 flex flex-col justify-center ">
              <div className="text-sm text-gray-500">Expiration Date</div>
              <Select.Root
                value={expirationOption?.value || ''}
                onValueChange={(value: string) => {
                  const option = expirationOptions.find(
                    (option) => option.value === value
                  )
                  if (option) {
                    setExpirationOption(option)
                  }
                }}
              >
                <Select.Trigger>
                  <div className="mt-2 flex items-center justify-between gap-1 rounded border-2 border-solid border-gray-200 px-4 py-2 hover:border-blue-700 focus:border-blue-700">
                    <div className="text-base font-normal">
                      <span>{expirationOption.text}</span>
                    </div>
                    <CgChevronDown className="text-gray-500" />
                  </div>
                </Select.Trigger>

                <Select.Content>
                  <Select.Group>
                    <div className="items-left no-scrollbar max-h-[280px] w-[460px] translate-y-[130px] overflow-y-auto rounded border-2 border-blue-700 bg-white">
                      {expirationOptions.map((option) => (
                        <Select.Item key={option.text} value={option.value}>
                          <div className="flex cursor-pointer items-center px-4 py-2 text-left hover:bg-gray-100">
                            {option.text}
                          </div>
                        </Select.Item>
                      ))}
                    </div>
                  </Select.Group>
                </Select.Content>
              </Select.Root>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (step === STEPS.ListItem) {
    ; (mainContent = (
      <div>
        {' '}
        <div>
          <div className="my-4 flex w-full flex-wrap justify-between">
            <div className="w-[48%] rounded border-2 border-[#7000FF]" />
            <div className="w-[48%] rounded border-2 border-gray-500" />
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-10">
            {error && (
              <div className="flex flex-row items-center justify-center gap-2 rounded-sm border bg-gray-100 px-10 py-2 text-xs text-gray-600">
                <HiExclamationCircle className="h-4 w-4 text-red-500" />
                <div>Oops! something went wrong</div>
              </div>
            )}
            <h1 className="text-md font-semibold">
              {isApproved
                ? 'Confirmed!'
                : 'Confirm listing on Hotpot in your wallet'}
            </h1>

            <div className="flex flex-row items-center justify-center gap-5">
              {tokenDetails?.image ? (
                <div className="w-14 rounded-sm object-fill">
                  <Image
                    loader={({ src, width }) => `${src}?w=${width}`}
                    src={optimizeImage(tokenDetails?.image, imageSize)}
                    alt={`${tokenDetails?.name}`}
                    className="w-full"
                    width={imageSize}
                    height={imageSize}
                    priority={true}
                    objectFit="cover"
                    layout="responsive"
                  />
                </div>
              ) : (
                <img src="/hotpot.png" className="h-14 w-14" />
              )}
              <div>
                <CgMore className="h-4 w-4 animate-ping" />
              </div>
              <img src="/hotpot.png" className="h-14 w-14" />
            </div>
            <div className="text-sm font-light text-gray-500">
              {isApproved
                ? 'Finalizing on the blockchain...'
                : 'A free off-chain signature to create the listing'}
            </div>
          </div>
        </div>
      </div>
    )),
      (sideContent = (
        <div className="grid-row mt-2 grid gap-1">
          <div className="flex flex-row justify-between rounded bg-[#F3F2F2] p-2">
            <div className="flex flex-row gap-1 text-sm text-gray-600">
              <div className="items-left flex flex-col gap-1">
                <div className="flex flex-row items-center">
                  <img src="/eth.svg" className="mr-2 h-3 w-3" alt="price" />
                  <div className="text-sm font-semibold">{priceValue}</div>
                </div>
              </div>
            </div>
            <img src="/hotpot.png" className="h-6 w-6" />
          </div>
        </div>
      ))
  }

  if (step === STEPS.Complete) {
    ; (mainContent = (
      <div>
        {' '}
        <div>
          <div className="my-4 flex w-full flex-wrap justify-between">
            <div className="w-[48%] rounded border-2 border-[#7000FF]" />
            <div className="w-[48%] rounded border-2 border-[#7000FF]" />
          </div>

          <div className="relative mt-10 flex flex-col items-center justify-center gap-2">
            <div className="absolute inset-0 z-10 mt-6 flex scale-100 transform items-center justify-center">
              <img src="/success.gif" className="object-cover" />
            </div>
            <HiCheckCircle className="h-[100px] w-[3100px] items-center justify-center text-green-700" />
            <h1 className="text-xl font-semibold">
              Your item has been listed!
            </h1>
            <div className="text-sm font-light text-gray-500">
              Your NFT has been listed for sale
            </div>
            <div className="z-20 mt-4 bg-white text-xs font-light text-gray-400">
              <a
                href={`https://goerli.etherscan.io/tx/${txn}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                View Transaction: {shortTxn}
              </a>
            </div>
          </div>
        </div>
      </div>
    )),
      (sideContent = (
        <div className="grid-row mt-2 grid gap-1">
          <div className="flex flex-row justify-between rounded bg-[#F3F2F2] p-2">
            <div className="flex flex-row gap-1 text-sm text-gray-600">
              <div className="items-left flex flex-col gap-1">
                <div className="flex flex-row items-center">
                  <img src="/eth.svg" className="mr-2 h-3 w-3" alt="price" />
                  <div className="text-sm font-semibold">{priceValue}</div>
                </div>
              </div>
            </div>
            <img src="/hotpot.png" className="h-6 w-6" />
          </div>
        </div>
      ))
  }

  return (
    <Modal trigger={trigger}>
      <Dialog.Content className="fixed top-[50%] left-[50%] mt-10 w-[90vw] max-w-[750px] translate-x-[-50%] translate-y-[-50%] rounded-lg bg-white pb-4 shadow-[hsl(206_22%_7%_/_35%)_0px_10px_38px_-10px,_hsl(206_22%_7%_/_20%)_0px_10px_20px_-15px] focus:outline-none data-[state=open]:animate-contentShow">
        <div className="flex flex-row justify-between rounded bg-[#F8F8F8] p-4">
          {' '}
          <Dialog.Title className='text-md m-0 font-semibold text-gray-900'>
            List Item for sale
          </Dialog.Title>
          <Dialog.Close asChild>
            <button
              onClick={onClose}
              className="inline-flex h-[25px] w-[25px] items-center justify-center text-gray-600 focus:outline-none"
              aria-label="Close"
            >
              <HiX />
            </button>
          </Dialog.Close>
        </div>
        <div className="m-2 flex min-h-[400px] flex-col md:flex-grow md:flex-row">
          <section className="flex w-1/3 flex-col gap-1 p-2 md:border-r">
            <div className="text-sm text-gray-500">Item</div>

            {tokenDetails?.image ? (
              <div className="w-[180px] rounded-sm object-fill">
                <Image
                  loader={({ src, width }) => `${src}?w=${width}`}
                  src={optimizeImage(tokenDetails?.image, imageSize)}
                  alt={`${tokenDetails?.name}`}
                  className="w-full"
                  width={imageSize}
                  height={imageSize}
                  priority={true}
                  objectFit="cover"
                  layout="responsive"
                />
              </div>
            ) : (
              <img
                src="/hotpot.png"
                className="w-[180px] rounded-sm object-fill"
              />
            )}
            <h1 className="truncate font-semibold">
              {' '}
              {tokenDetails?.name || tokenDetails?.tokenId}
            </h1>
            <p className="truncate text-sm text-gray-500">
              {' '}
              {tokenDetails?.collection?.name}
            </p>
            {sideContent}
          </section>
          <main className="flex w-2/3 flex-col justify-between px-4">
            {mainContent}
            <div className="mt-[25px] flex justify-end gap-4">
              {!isLoading &&
                error &&
                step === STEPS.ListItem &&
                secondaryActionLabel && (
                  <button
                    onClick={onEdit}
                    className="w-full rounded border border-black bg-white py-2 text-black hover:bg-gray-100"
                  >
                    Edit List
                  </button>
                )}

              {step !== STEPS.Complete && (
                <button
                  onClick={primaryAction}
                  disabled={
                    isLoading || (step === STEPS.SetPrice && priceValue <= 0)
                  }
                  className={`w-full rounded py-2 text-white ${isLoading || (step === STEPS.SetPrice && priceValue <= 0)
                      ? 'cursor-not-allowed bg-gray-400'
                      : 'cursor-pointer bg-[#7000FF] hover:bg-[#430099]'
                    }`}
                >
                  {isLoading ? (
                    <>
                      <CgSpinner className="mr-2 inline-block h-6 w-6 animate-spin" />
                      {isApproved
                        ? 'Waiting to be Validated'
                        : 'Waiting for Approval'}
                    </>
                  ) : error ? (
                    'Retry'
                  ) : (
                    actionLabel
                  )}
                </button>
              )}
            </div>
          </main>
        </div>
      </Dialog.Content>
    </Modal>
  )
}

export default ListModal
